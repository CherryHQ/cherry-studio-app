import { Paths } from 'expo-file-system';

import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import { createHttpClient, isHttpError } from '@/backend/services/http';
import { getProviderConfigurationIssue } from '@/backend/services/providers/providerConfiguration';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { raceAbort } from '@/backend/utils/raceAbort';
import {
  DiagnosticFeedbackContextSchema,
  type DiagnosticsModule,
  type DiagnosticFeedbackContext,
} from '@/shared/contracts/diagnostics';
import {
  DiagnosticSessionError,
  type DiagnosticSession,
  type DiagnosticCheck,
  type DiagnosticReport,
  type DiagnosticAgent,
  type DiagnosticConfiguration,
  type DiagnosticEndpointCheck,
  type DiagnosticPlugins,
} from '@/shared/contracts/diagnosticSession';
import type { ModelsModule } from '@/shared/contracts/models';
import type { PermissionStatuses } from '@/shared/contracts/permissions';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { readDiagnosticLogSummary } from './diagnosticLogSummary';

type Dependencies = {
  bundle: Pick<DiagnosticsModule, 'uploadBundle' | 'getReportStatus'>;
  agent: DiagnosticAgent;
  resolveConnection(provider: Provider, model: Model): { baseUrl: string };
  resolveServiceUrl(baseUrl: string, auth: AuthConfig | null): string;
  model: Pick<ModelService, 'getById'>;
  provider: Pick<ProviderService, 'getByProviderId' | 'listApiKeys' | 'getAuthConfig'>;
  models: Pick<ModelsModule, 'checkChat'>;
  defaultModel(): Promise<string | null>;
  language(): string;
  oauthSignedIn(provider: Provider): Promise<boolean>;
  plugins(): Promise<DiagnosticPlugins>;
  permissions(): Promise<PermissionStatuses>;
  applicationData(
    context: DiagnosticFeedbackContext | undefined,
    signal: AbortSignal,
  ): Promise<{ missingCount: number }>;
  runtimeStorage(signal: AbortSignal): Promise<'ready' | 'not_initialized' | 'failed'>;
};
type Target = {
  model: Model;
  provider: Provider;
  fingerprint: string;
  issue: ReturnType<typeof getProviderConfigurationIssue> | 'disabled-provider';
  endpoint?: URL;
};

/** Bootstrap owns admission; each diagnostic sheet owns its cancellable session. */
export function createDiagnosticsModule(dependencies: Dependencies) {
  const sessions = new Set<DiagnosticSession>();
  let stopped = false;
  const module: DiagnosticsModule = {
    uploadBundle: (input) => dependencies.bundle.uploadBundle(input),
    getReportStatus: (id, signal) => dependencies.bundle.getReportStatus(id, signal),
    createSession(input) {
      if (stopped) throw new DiagnosticSessionError('unavailable');
      const context = input ? DiagnosticFeedbackContextSchema.parse(input) : undefined;
      const session = createSession(dependencies, context, () => sessions.delete(session));
      sessions.add(session);
      return session;
    },
  };
  return {
    module,
    async dispose() {
      stopped = true;
      await Promise.all([...sessions].map((session) => session.dispose()));
    },
  };
}

function createSession(
  deps: Dependencies,
  context: DiagnosticFeedbackContext | undefined,
  release: () => void,
): DiagnosticSession {
  let bound: Target | undefined;
  let report: DiagnosticReport | undefined;
  let running: { controller: AbortController; promise: Promise<unknown> } | undefined;
  let disposed = false;

  async function loadTarget(signal: AbortSignal, id?: string): Promise<Target | undefined> {
    signal.throwIfAborted();
    const selected =
      id ??
      (context
        ? context.providerId && context.modelId
          ? createUniqueModelId(context.providerId, context.modelId)
          : null
        : await raceAbort(deps.defaultModel(), signal));
    signal.throwIfAborted();
    if (!selected || context?.executionSource === 'desktop') return undefined;
    const model = await raceAbort(deps.model.getById(selected), signal);
    if (!model) return undefined;
    signal.throwIfAborted();
    const provider = await raceAbort(deps.provider.getByProviderId(model.providerId), signal);
    signal.throwIfAborted();
    const [{ keys }, auth, signedIn] = await raceAbort(
      Promise.all([
        deps.provider.listApiKeys(provider.id),
        deps.provider.getAuthConfig(provider.id),
        deps.oauthSignedIn(provider),
      ]),
      signal,
    );
    signal.throwIfAborted();
    let connection = { baseUrl: '' };
    let endpoint: URL | undefined;
    try {
      connection = deps.resolveConnection(provider, model);
      const parsed = new URL(deps.resolveServiceUrl(connection.baseUrl, auth));
      if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password)
        endpoint = parsed;
    } catch {
      /* Invalid or non-HTTP endpoints remain configuration evidence. */
    }
    return {
      model,
      provider,
      endpoint,
      fingerprint: JSON.stringify({ model, provider, keys, auth, signedIn }),
      issue: !provider.isEnabled
        ? 'disabled-provider'
        : getProviderConfigurationIssue(provider, keys, auth, signedIn, connection),
    };
  }

  async function assertCurrent(signal: AbortSignal) {
    signal.throwIfAborted();
    if (report && Date.now() - Date.parse(report.checkedAt) > 5 * 60 * 1000)
      throw new DiagnosticSessionError('stale');
    if (bound) {
      const current = await loadTarget(signal, bound.model.id);
      signal.throwIfAborted();
      if (!current || current.fingerprint !== bound.fingerprint)
        throw new DiagnosticSessionError('stale');
    }
  }

  function operation<T>(
    action: (signal: AbortSignal) => Promise<T>,
    timeoutMs = 30000,
  ): Promise<T> {
    if (disposed) return Promise.reject(new DiagnosticSessionError('cancelled'));
    if (running) return Promise.reject(new DiagnosticSessionError('busy'));
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const promise = Promise.resolve()
      .then(() => action(controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted)
          throw new DiagnosticSessionError(timedOut ? 'timeout' : 'cancelled');
        if (error instanceof DiagnosticSessionError) throw error;
        throw new DiagnosticSessionError('unavailable');
      })
      .finally(() => {
        clearTimeout(timer);
        if (running?.controller === controller) running = undefined;
      });
    running = { controller, promise };
    return promise;
  }

  async function endpointCheck(signal: AbortSignal): Promise<DiagnosticEndpointCheck> {
    await assertCurrent(signal);
    if (!bound?.endpoint) return { id: 'endpoint', status: 'skipped', issue: 'configuration' };
    const start = performance.now();
    const client = createHttpClient({
      baseUrl: bound.endpoint.origin,
      statusPolicy: 'all',
      timeoutMs: 8000,
    });
    try {
      const response = await client.request({
        method: 'GET',
        path: '/',
        logPath: '/diagnostic-probe',
        credentials: 'omit',
        redirect: 'error',
        responseType: 'text',
        maxResponseBytes: 4096,
        signal,
      });
      return {
        id: 'endpoint',
        status: 'pass',
        facts: { httpStatus: response.status, latencyMs: Math.round(performance.now() - start) },
      };
    } catch (error) {
      signal.throwIfAborted();
      if (isHttpError(error) && error.status)
        return { id: 'endpoint', status: 'pass', facts: { httpStatus: error.status } };
      return {
        id: 'endpoint',
        status: 'fail',
        issue: isHttpError(error) && error.kind === 'timeout' ? 'timeout' : 'network',
      };
    }
  }

  function store(check: DiagnosticCheck) {
    if (!report) throw new DiagnosticSessionError('unavailable');
    report = {
      ...report,
      checks: [...report.checks.filter((item) => item.id !== check.id), check],
    };
    return report;
  }

  return {
    check(options = {}) {
      return operation(async (signal) => {
        bound = undefined;
        report = { checkedAt: new Date().toISOString(), context, checks: [] };
        const publish = (check: DiagnosticCheck) => {
          signal.throwIfAborted();
          store(check);
          options.onCheck?.(check);
        };
        const inspect = async (
          id: DiagnosticCheck['id'],
          read: (checkSignal: AbortSignal) => Promise<DiagnosticCheck>,
        ) => {
          publish({ id, status: 'pending' });
          const timeout = new AbortController();
          const linked = linkAbortSignals([signal, timeout.signal]);
          const timer = setTimeout(() => timeout.abort(), 8000);
          try {
            const result = await raceAbort(read(linked.signal), linked.signal);
            publish(result);
          } catch {
            signal.throwIfAborted();
            publish({
              id,
              status: 'error',
              issue: timeout.signal.aborted ? 'timeout' : 'unavailable',
            });
          } finally {
            clearTimeout(timer);
            linked.dispose();
          }
        };
        const configuration = inspect('model', async (checkSignal) => {
          const target = await loadTarget(checkSignal);
          checkSignal.throwIfAborted();
          bound = target;
          if (target)
            report = {
              ...report!,
              target: {
                uniqueModelId: target.model.id,
                providerId: target.provider.id,
                modelId: target.model.modelId,
                providerName: target.provider.name,
                modelName: target.model.name,
                endpointHost: target.endpoint?.hostname,
                configurationIssue: target.issue ?? undefined,
              },
            };
          return {
            id: 'model',
            status: target ? (target.issue ? 'fail' : 'pass') : 'skipped',
            issue: !target
              ? context?.executionSource === 'desktop'
                ? 'remote'
                : 'missing_model'
              : target.issue
                ? 'configuration'
                : undefined,
          };
        });
        const tasks = [
          configuration,
          inspect('data', async (checkSignal) => {
            const facts = await deps.applicationData(context, checkSignal);
            return {
              id: 'data',
              status: facts.missingCount ? 'fail' : 'pass',
              issue: facts.missingCount ? 'data' : undefined,
              facts,
            };
          }),
          inspect('runtime', async (checkSignal) => {
            const state = await deps.runtimeStorage(checkSignal);
            return {
              id: 'runtime',
              status:
                state === 'not_initialized' ? 'skipped' : state === 'failed' ? 'fail' : 'pass',
              issue:
                state === 'not_initialized'
                  ? 'not_initialized'
                  : state === 'failed'
                    ? 'runtime'
                    : undefined,
            };
          }),
        ];
        if (!context) {
          tasks.push(
            inspect('plugins', async () => {
              const counts = await deps.plugins();
              return {
                id: 'plugins',
                status: counts.connectedCount === counts.enabledCount ? 'pass' : 'warn',
                facts: { enabledCount: counts.enabledCount, connectedCount: counts.connectedCount },
              };
            }),
            inspect('permissions', async () => {
              const permissions = await deps.permissions();
              const values = Object.values(permissions).filter((value) => value !== undefined);
              const missingCount = values.filter(
                (value) => !['granted', 'limited', 'requested'].includes(value.state),
              ).length;
              return {
                id: 'permissions',
                status: missingCount ? 'warn' : 'pass',
                facts: { missingCount },
              };
            }),
            inspect('storage', async () => {
              const freeBytes = Paths.availableDiskSpace;
              if (!Number.isFinite(freeBytes) || freeBytes < 0)
                throw new Error('Storage unavailable');
              return {
                id: 'storage',
                status: freeBytes < 100 * 1024 * 1024 ? 'warn' : 'pass',
                facts: { freeBytes },
              };
            }),
          );
        }
        if (options.network)
          tasks.push(configuration.then(() => inspect('endpoint', endpointCheck)));
        await Promise.all(tasks);
        signal.throwIfAborted();
        return report!;
      });
    },
    checkConversation() {
      return operation(async (signal) => {
        await assertCurrent(signal);
        if (!report || !bound || !isTextGenerationModel(bound.model))
          throw new DiagnosticSessionError('unavailable');
        const result = await deps.models.checkChat({ modelId: bound.model.id, signal });
        await assertCurrent(signal);
        return store(
          result.status === 'success'
            ? { id: 'conversation', status: 'pass', facts: { latencyMs: result.latency } }
            : {
                id: 'conversation',
                status: 'fail',
                issue: result.reason === 'rateLimit' ? 'rate_limit' : result.reason,
              },
        );
      });
    },
    diagnose(modelId, onEvidence) {
      return operation(async (signal) => {
        if (!report) throw new DiagnosticSessionError('unavailable');
        await assertCurrent(signal);
        const model = await raceAbort(deps.model.getById(modelId), signal);
        signal.throwIfAborted();
        if (!model || !isTextGenerationModel(model))
          throw new DiagnosticSessionError('unsupported_model');
        const configuration = (): DiagnosticConfiguration => ({
          provider: diagnosticIdentifier(bound?.provider.id) ?? null,
          model: diagnosticIdentifier(bound?.model.modelId) ?? null,
          endpointHost: diagnosticIdentifier(bound?.endpoint?.hostname) ?? null,
          configurationIssue: bound?.issue ?? null,
          remoteExecution: context?.executionSource === 'desktop',
        });
        return deps.agent.run({
          model,
          signal,
          language: deps.language(),
          onEvidence,
          context: {
            configuration: configuration(),
            checks: report.checks,
            incident: context?.error ?? null,
          },
          facts: {
            configuration: async (toolSignal) => {
              await assertCurrent(toolSignal);
              return configuration();
            },
            endpoint: endpointCheck,
            plugins: async (toolSignal) => {
              toolSignal.throwIfAborted();
              return deps.plugins();
            },
            logs: (toolSignal) => readDiagnosticLogSummary(context, toolSignal),
          },
        });
      }, deps.agent.timeoutMs);
    },
    cancel() {
      running?.controller.abort();
    },
    async dispose() {
      disposed = true;
      running?.controller.abort();
      await running?.promise.catch(() => undefined);
      release();
      bound = undefined;
      report = undefined;
    },
  };
}
