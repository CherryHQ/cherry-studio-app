import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import { DiagnosticSessionError } from '@/shared/contracts/diagnosticSession';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { createDiagnosticsModule } from '../createDiagnosticsModule';

jest.mock('expo-file-system', () => ({ Paths: { availableDiskSpace: 1024 ** 3 } }));
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: async () => ({ status: 200, data: '' }) }),
  isHttpError: () => false,
}));

function fixture() {
  const model = {
    id: createUniqueModelId('provider', 'model'),
    providerId: 'provider',
    modelId: 'model',
    name: 'Model',
    capabilities: [],
  } as unknown as Model;
  const provider = {
    id: 'provider',
    name: 'Provider',
    isEnabled: true,
    authType: 'api-key',
    modelListSource: 'remote',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://provider.example/v1' } },
  } as unknown as Provider;
  const context: DiagnosticFeedbackContext = {
    entry: 'error',
    feature: 'chat',
    capturedAt: '2026-11-06T00:00:00Z',
    providerId: 'provider',
    modelId: 'model',
  };
  const runAi = jest.fn<
    ReturnType<Parameters<typeof createDiagnosticsModule>[0]['runAi']>,
    Parameters<Parameters<typeof createDiagnosticsModule>[0]['runAi']>
  >(async () => ({
    cause: 'Check the address',
    advice: ['Open settings'],
    evidence: [],
    modelName: 'Diagnostic model',
  }));
  const defaultModel = jest.fn(async () => model.id);
  const checkChat = jest.fn(async () => ({ status: 'success' as const, latency: 10 }));
  const deps: Parameters<typeof createDiagnosticsModule>[0] = {
    bundle: {
      uploadBundle: async () => ({ status: 'busy' }),
      getReportStatus: async () => ({ status: 'not_found' }),
    },
    model: { getById: async (id) => (id === model.id ? model : null) },
    provider: {
      getByProviderId: async () => provider,
      listApiKeys: async () => ({
        keys: [{ id: 'key', key: 'sk-private-credential', isEnabled: true }],
      }),
      getAuthConfig: async () => null,
    },
    models: { pull: async () => ({ status: 'up-to-date' }), checkChat },
    resolveConnection: () => ({
      baseUrl: provider.endpointConfigs?.['openai-chat-completions']?.baseUrl ?? '',
    }),
    defaultModel,
    language: () => 'en-US',
    oauthSignedIn: async () => false,
    plugins: async () => ({
      enabledCount: 0,
      connectedCount: 0,
      truncated: false,
      connections: [],
    }),
    permissions: async () => ({}),
    runAi,
  };
  return { model, provider, context, deps, runAi, defaultModel, checkChat };
}

test('an incident without model identity never checks the current default model', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession({
    ...f.context,
    providerId: undefined,
    modelId: undefined,
  });
  const report = await session.check({ network: true });
  expect(report.target).toBeUndefined();
  expect(report.checks).toEqual([{ id: 'model', status: 'skipped', issue: 'missing_model' }]);
  expect(f.defaultModel).not.toHaveBeenCalled();
  await owner.dispose();
});

test('desktop incidents do not run phone model probes or resolve its credentials', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const report = await owner.module
    .createSession({ ...f.context, executionSource: 'desktop' })
    .check({ network: true });
  expect(report.checks).toEqual([{ id: 'model', status: 'skipped', issue: 'remote' }]);
  expect(f.checkChat).not.toHaveBeenCalled();
  await owner.dispose();
});

test('a provider configuration change invalidates a previous report before another paid operation', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  await session.check({ network: true });
  f.provider.endpointConfigs!['openai-chat-completions']!.baseUrl = 'https://changed.example/v1';
  await expect(session.checkConversation()).rejects.toMatchObject({ reason: 'stale' });
  await expect(session.diagnose(f.model.id)).rejects.toMatchObject({ reason: 'stale' });
  expect(f.checkChat).not.toHaveBeenCalled();
  expect(f.runAi).not.toHaveBeenCalled();
  await owner.dispose();
});

test('AI input and its fixed configuration tool never receive stored credentials', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  await session.check();
  await session.diagnose(f.model.id);
  const input = f.runAi.mock.calls[0]![0];
  expect(input.tools.map((tool) => tool.id)).toEqual([
    'configuration',
    'endpoint',
    'plugins',
    'logs',
  ]);
  const configuration = await input.tools[0]!.read(new AbortController().signal);
  expect(configuration).toMatchObject({
    provider: 'provider',
    model: 'model',
    endpointHost: 'provider.example',
  });
  expect(JSON.stringify({ context: input.context, configuration })).not.toContain(
    'sk-private-credential',
  );
  await owner.dispose();
});

test('host disposal aborts and joins an admitted AI run and rejects later admissions', async () => {
  const f = fixture();
  let started!: () => void;
  const admitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.runAi.mockImplementation(
    ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DiagnosticSessionError('cancelled')), {
          once: true,
        });
        started();
      }),
  );
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  await session.check();
  const running = session.diagnose(f.model.id);
  const stopped = expect(running).rejects.toMatchObject({ reason: 'cancelled' });
  await admitted;
  await owner.dispose();
  await stopped;
  expect(() => owner.module.createSession()).toThrow(DiagnosticSessionError);
  await expect(session.check()).rejects.toMatchObject({ reason: 'cancelled' });
});
