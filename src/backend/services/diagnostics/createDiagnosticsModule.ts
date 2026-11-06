import { Paths } from 'expo-file-system';

import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import { createHttpClient, isHttpError } from '@/backend/services/http';
import { getProviderConfigurationIssue } from '@/backend/services/providers/providerConfiguration';
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
  type DiagnosticIssue,
  type DiagnosticReport,
  type DiagnosticAiReport,
  type DiagnosticEvidence,
  type DiagnosticToolId,
} from '@/shared/contracts/diagnosticSession';
import {
  ModelPullError,
  ModelPullTimeoutError,
  type ModelsModule,
} from '@/shared/contracts/models';
import type { PermissionStatuses } from '@/shared/contracts/permissions';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { readDiagnosticLogSummary } from './diagnosticLogSummary';

type Dependencies = {
  bundle: Pick<DiagnosticsModule, 'uploadBundle' | 'getReportStatus'>;
  runAi(input: {
    model: Model;
    language: string;
    context: unknown;
    tools: {
      id: DiagnosticToolId;
      description: string;
      read(signal: AbortSignal): Promise<unknown>;
    }[];
    signal: AbortSignal;
    onEvidence?: (evidence: DiagnosticEvidence) => void;
  }): Promise<DiagnosticAiReport>;
  resolveConnection(provider: Provider, model: Model): { baseUrl: string };
  model: Pick<ModelService, 'getById'>;
  provider: Pick<ProviderService, 'getByProviderId' | 'listApiKeys' | 'getAuthConfig'>;
  models: Pick<ModelsModule, 'pull' | 'checkChat'>;
  defaultModel(): Promise<string | null>;
  language(): string;
  oauthSignedIn(provider: Provider): Promise<boolean>;
  plugins(): Promise<{
    enabledCount: number;
    connectedCount: number;
    truncated: boolean;
    connections: { state: string }[];
  }>;
  permissions(): Promise<PermissionStatuses>;
};
type Target = {
  model: Model;
  provider: Provider;
  fingerprint: string;
  issue: ReturnType<typeof getProviderConfigurationIssue> | 'disabled-provider';
  endpoint?: URL;
};

/** The bootstrap owns admission; each route owns its transient, cancellable session. */
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

  async function loadTarget(id?: string): Promise<Target | undefined> {
    const selected =
      id ??
      (context
        ? context.providerId && context.modelId
          ? createUniqueModelId(context.providerId, context.modelId)
          : null
        : await deps.defaultModel());
    if (!selected || context?.executionSource === 'desktop') return undefined;
    const model = await deps.model.getById(selected);
    if (!model) return undefined;
    const provider = await deps.provider.getByProviderId(model.providerId);
    const [{ keys }, auth, signedIn] = await Promise.all([
      deps.provider.listApiKeys(provider.id),
      deps.provider.getAuthConfig(provider.id),
      deps.oauthSignedIn(provider),
    ]);
    let endpoint: URL | undefined;
    try {
      const parsed = new URL(deps.resolveConnection(provider, model).baseUrl);
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
        : getProviderConfigurationIssue(provider, keys, auth, signedIn),
    };
  }

  async function assertCurrent(signal: AbortSignal) {
    signal.throwIfAborted();
    if (report && Date.now() - Date.parse(report.checkedAt) > 5 * 60 * 1000)
      throw new DiagnosticSessionError('stale');
    if (bound) {
      const current = await loadTarget(bound.model.id);
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

  async function endpointCheck(signal: AbortSignal): Promise<DiagnosticCheck> {
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

  async function listCheck(signal: AbortSignal): Promise<DiagnosticCheck> {
    await assertCurrent(signal);
    if (!bound || bound.issue)
      return { id: 'model_list', status: 'skipped', issue: 'configuration' };
    if (bound.provider.modelListSource === 'registry')
      return { id: 'model_list', status: 'skipped', issue: 'unsupported' };
    try {
      await deps.models.pull(bound.provider.id, signal);
      await assertCurrent(signal);
      return { id: 'model_list', status: 'pass' };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DiagnosticSessionError) throw error;
      const issue: DiagnosticIssue =
        error instanceof ModelPullTimeoutError
          ? 'timeout'
          : error instanceof ModelPullError
            ? (
                {
                  authentication: 'authentication',
                  unavailable: 'unsupported',
                  'rate-limited': 'rate_limit',
                  network: 'network',
                  failed: 'unknown',
                } as const
              )[error.reason]
            : 'unknown';
      return { id: 'model_list', status: issue === 'unsupported' ? 'skipped' : 'fail', issue };
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
        report = undefined;
        bound = undefined;
        bound = await raceAbort(loadTarget(), signal);
        report = {
          checkedAt: new Date().toISOString(),
          context,
          checks: [],
          target: bound
            ? {
                uniqueModelId: bound.model.id,
                providerId: bound.provider.id,
                modelId: bound.model.modelId,
                providerName: bound.provider.name,
                modelName: bound.model.name,
                endpointHost: bound.endpoint?.hostname,
              }
            : undefined,
        };
        const publish = (check: DiagnosticCheck) => {
          signal.throwIfAborted();
          store(check);
          options.onCheck?.(check);
        };
        const inspect = async (id: DiagnosticCheck['id'], read: () => Promise<DiagnosticCheck>) => {
          try {
            publish(await raceAbort(read(), signal));
          } catch {
            signal.throwIfAborted();
            publish({ id, status: 'error', issue: 'unavailable' });
          }
        };
        publish({
          id: 'model',
          status: bound ? (bound.issue ? 'fail' : 'pass') : 'skipped',
          issue: !bound
            ? context?.executionSource === 'desktop'
              ? 'remote'
              : 'missing_model'
            : bound.issue
              ? 'configuration'
              : undefined,
        });
        if (!context) {
          await inspect('plugins', async () => {
            const counts = await deps.plugins();
            return {
              id: 'plugins',
              status: counts.connectedCount === counts.enabledCount ? 'pass' : 'warn',
              facts: { enabledCount: counts.enabledCount, connectedCount: counts.connectedCount },
            };
          });
          await inspect('permissions', async () => {
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
          });
          await inspect('storage', async () => {
            const freeBytes = Paths.availableDiskSpace;
            if (!Number.isFinite(freeBytes) || freeBytes < 0)
              throw new Error('Storage unavailable');
            return {
              id: 'storage',
              status: freeBytes < 100 * 1024 * 1024 ? 'warn' : 'pass',
              facts: { freeBytes },
            };
          });
        }
        if (options.network && bound) {
          publish(await endpointCheck(signal));
          publish(await listCheck(signal));
          publish({
            id: 'conversation',
            status: isTextGenerationModel(bound.model) ? 'pending' : 'skipped',
            issue: !isTextGenerationModel(bound.model) ? 'unsupported' : undefined,
          });
        }
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
        const model = await deps.model.getById(modelId);
        if (!model || !isTextGenerationModel(model))
          throw new DiagnosticSessionError('unsupported_model');
        const configuration = () => ({
          provider: diagnosticIdentifier(bound?.provider.id) ?? null,
          model: diagnosticIdentifier(bound?.model.modelId) ?? null,
          endpointHost: diagnosticIdentifier(bound?.endpoint?.hostname) ?? null,
          configurationIssue: bound?.issue ?? null,
          remoteExecution: context?.executionSource === 'desktop',
        });
        return deps.runAi({
          model,
          signal,
          language: deps.language(),
          onEvidence,
          context: {
            configuration: configuration(),
            checks: JSON.parse(JSON.stringify(report.checks)),
            incident: JSON.parse(JSON.stringify(context?.error ?? null)),
          },
          tools: [
            {
              id: 'configuration',
              description:
                'Read the fixed incident model/provider configuration summary. No keys, headers, private paths or chat text.',
              read: async (toolSignal) => {
                await assertCurrent(toolSignal);
                return configuration();
              },
            },
            {
              id: 'endpoint',
              description:
                'Probe only the incident provider origin without credentials. Reports reachability, not authentication.',
              read: async (toolSignal) =>
                JSON.parse(JSON.stringify(await endpointCheck(toolSignal))),
            },
            {
              id: 'plugins',
              description:
                'Read cached plugin connection states without reconnecting or executing plugins.',
              read: async (toolSignal) => {
                toolSignal.throwIfAborted();
                return deps.plugins();
              },
            },
            {
              id: 'logs',
              description:
                'Read at most 12 recent allowlisted technical log summaries. No raw logs or chat content.',
              read: async (toolSignal) =>
                JSON.parse(JSON.stringify(await readDiagnosticLogSummary(context, toolSignal))),
            },
          ],
        });
      }, 60000);
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
