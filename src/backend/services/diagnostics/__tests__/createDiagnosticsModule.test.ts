import { resolveEffectiveEndpoint } from '@cherrystudio/ai-runtime/provider';

import { createHttpClient } from '@/backend/services/http';
import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import { DiagnosticSessionError } from '@/shared/contracts/diagnosticSession';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { createDiagnosticsModule } from '../createDiagnosticsModule';

jest.mock('expo-file-system', () => ({ Paths: { availableDiskSpace: 1024 ** 3 } }));
jest.mock('@/backend/services/http', () => ({
  createHttpClient: jest.fn(() => ({ request: async () => ({ status: 200, data: '' }) })),
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
  const runAgent = jest.fn<
    ReturnType<Parameters<typeof createDiagnosticsModule>[0]['agent']['run']>,
    Parameters<Parameters<typeof createDiagnosticsModule>[0]['agent']['run']>
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
    models: { checkChat },
    applicationData: async () => ({ missingCount: 0 }),
    runtimeStorage: async () => 'ready',
    resolveConnection: () => ({
      baseUrl: provider.endpointConfigs?.['openai-chat-completions']?.baseUrl ?? '',
    }),
    resolveServiceUrl: (baseUrl) => baseUrl,
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
    agent: { timeoutMs: 60000, run: runAgent },
  };
  return { model, provider, context, deps, runAgent, defaultModel, checkChat };
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
  expect(report.checks).toEqual(
    expect.arrayContaining([
      { id: 'model', status: 'skipped', issue: 'missing_model' },
      { id: 'data', status: 'pass', facts: { missingCount: 0 } },
      { id: 'runtime', status: 'pass' },
    ]),
  );
  expect(f.defaultModel).not.toHaveBeenCalled();
  await owner.dispose();
});

test.each(['', 'https://aiplatform.googleapis.com/v1'])(
  'diagnostic probes and AI facts use the supplied service URL, preserving configured URL %s for validation',
  async (baseUrl) => {
    const f = fixture();
    f.provider.authType = 'iam-gcp';
    f.provider.defaultChatEndpoint = 'google-generate-content';
    f.provider.endpointConfigs = { 'google-generate-content': { baseUrl } };
    f.model.endpointTypes = ['google-generate-content'];
    f.deps.resolveConnection = resolveEffectiveEndpoint;
    const resolveServiceUrl = jest.fn(() => 'https://us-central1-aiplatform.googleapis.com');
    f.deps.resolveServiceUrl = resolveServiceUrl;
    f.deps.provider.getAuthConfig = async () => ({
      type: 'iam-gcp',
      project: 'project-id',
      location: 'us-central1',
      credentials: {
        client_email: 'svc@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nYWJjZA==\n-----END PRIVATE KEY-----',
      },
    });
    const owner = createDiagnosticsModule(f.deps);
    const session = owner.module.createSession(f.context);
    try {
      const report = await session.check({ network: true });
      expect(report.target).toMatchObject({
        endpointHost: 'us-central1-aiplatform.googleapis.com',
      });
      expect(report.target?.configurationIssue).toBeUndefined();
      expect(report.checks).toContainEqual({ id: 'model', status: 'pass', issue: undefined });
      expect(report.checks).toContainEqual(
        expect.objectContaining({ id: 'endpoint', status: 'pass' }),
      );
      expect(resolveServiceUrl).toHaveBeenCalledWith(
        baseUrl,
        expect.objectContaining({
          type: 'iam-gcp',
          project: 'project-id',
          location: 'us-central1',
        }),
      );
      expect(createHttpClient).toHaveBeenLastCalledWith(
        expect.objectContaining({ baseUrl: 'https://us-central1-aiplatform.googleapis.com' }),
      );
      await session.diagnose(f.model.id);
      expect(f.runAgent.mock.calls.at(-1)?.[0].context.configuration.endpointHost).toBe(
        'us-central1-aiplatform.googleapis.com',
      );

      // Derivation must not mask a stored project/location mismatch as a valid empty default.
      f.provider.endpointConfigs['google-generate-content']!.baseUrl =
        'https://aiplatform.googleapis.com/v1/projects/other/locations/us-central1';
      resolveServiceUrl.mockImplementation(() => {
        throw new Error('The configured project does not match the service address.');
      });
      const invalid = await session.check({ network: true });
      expect(invalid.target?.configurationIssue).toBe('invalid-endpoint');
      expect(invalid.checks).toContainEqual({
        id: 'endpoint',
        status: 'skipped',
        issue: 'configuration',
      });
    } finally {
      await owner.dispose();
    }
  },
);

test('desktop incidents do not run phone model probes or resolve its credentials', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const report = await owner.module
    .createSession({ ...f.context, executionSource: 'desktop' })
    .check({ network: true });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      { id: 'model', status: 'skipped', issue: 'remote' },
      { id: 'endpoint', status: 'skipped', issue: 'configuration' },
    ]),
  );
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
  expect(f.runAgent).not.toHaveBeenCalled();
  await owner.dispose();
});

test('the incident model effective endpoint supplies both configuration and connection facts', async () => {
  const f = fixture();
  f.model.endpointTypes = ['anthropic-messages'];
  f.provider.endpointConfigs = {
    'openai-chat-completions': { baseUrl: 'file:///invalid-default' },
    'anthropic-messages': { baseUrl: 'https://actual.example' },
  };
  f.deps.resolveConnection = resolveEffectiveEndpoint;
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  try {
    const report = await session.check({ network: true });
    expect(report.target).toMatchObject({ endpointHost: 'actual.example' });
    expect(report.target?.configurationIssue).toBeUndefined();
    expect(report.checks).toContainEqual({ id: 'model', status: 'pass', issue: undefined });

    f.provider.endpointConfigs['openai-chat-completions']!.baseUrl = 'https://default.example';
    f.provider.endpointConfigs['anthropic-messages']!.baseUrl = 'file:///invalid-actual';
    const invalid = await session.check();
    expect(invalid.target?.configurationIssue).toBe('invalid-endpoint');
    expect(invalid.checks).toContainEqual({ id: 'model', status: 'fail', issue: 'configuration' });
  } finally {
    await owner.dispose();
  }
});

test.each(['cancel', 'timeout'] as const)(
  '%s releases an AI configuration recheck using the Agent deadline and lets the owner finish disposal',
  async (ending) => {
    const f = fixture();
    if (ending === 'timeout') f.deps.agent = { ...f.deps.agent, timeoutMs: 1234 };
    const owner = createDiagnosticsModule(f.deps);
    const session = owner.module.createSession(f.context);
    await session.check();
    let release!: (signedIn: boolean) => void;
    let started!: () => void;
    const admitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.deps.oauthSignedIn = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
        started();
      });
    if (ending === 'timeout') jest.useFakeTimers();
    try {
      const running = session.diagnose(f.model.id);
      const stopped = expect(running).rejects.toMatchObject({
        reason: ending === 'timeout' ? 'timeout' : 'cancelled',
      });
      await admitted;
      if (ending === 'timeout') await jest.advanceTimersByTimeAsync(f.deps.agent.timeoutMs);
      else session.cancel();
      await stopped;
      await owner.dispose();
      release(false);
      await Promise.resolve();
      expect(f.runAgent).not.toHaveBeenCalled();
    } finally {
      release?.(false);
      await owner.dispose();
      if (ending === 'timeout') jest.useRealTimers();
    }
  },
);

test('disposal cancels a diagnostic model lookup without admitting its late result', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  await session.check();
  const analysisModel = { ...f.model, id: createUniqueModelId('provider', 'analysis-model') };
  let release!: (model: Model) => void;
  let started!: () => void;
  const admitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.deps.model.getById = async (id) =>
    id === f.model.id
      ? f.model
      : new Promise<Model>((resolve) => {
          release = resolve;
          started();
        });
  const running = session.diagnose(analysisModel.id);
  const stopped = expect(running).rejects.toMatchObject({ reason: 'cancelled' });
  await admitted;
  await owner.dispose();
  await stopped;
  release(analysisModel);
  await Promise.resolve();
  expect(f.runAgent).not.toHaveBeenCalled();
});

test('AI input and its fixed configuration tool never receive stored credentials', async () => {
  const f = fixture();
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  await session.check();
  await session.diagnose(f.model.id);
  const input = f.runAgent.mock.calls[0]![0];
  const configuration = await input.facts.configuration(new AbortController().signal);
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
  f.runAgent.mockImplementation(
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

test('a stalled configuration lookup does not block local results or leave checks pending', async () => {
  jest.useFakeTimers();
  const f = fixture();
  f.deps.model.getById = () => new Promise(() => {});
  const owner = createDiagnosticsModule(f.deps);
  const observed: { id: string; status: string }[] = [];
  try {
    const pending = owner.module
      .createSession(f.context)
      .check({ network: true, onCheck: (check) => observed.push(check) });
    await jest.advanceTimersByTimeAsync(0);
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'data', status: 'pass' }),
        { id: 'runtime', status: 'pass' },
      ]),
    );
    await jest.advanceTimersByTimeAsync(8000);
    const report = await pending;
    expect(report.checks).toEqual(
      expect.arrayContaining([
        { id: 'model', status: 'error', issue: 'timeout' },
        { id: 'endpoint', status: 'skipped', issue: 'configuration' },
      ]),
    );
    expect(report.checks.every((check) => check.status !== 'pending')).toBe(true);
    expect(f.runAgent).not.toHaveBeenCalled();
    expect(f.checkChat).not.toHaveBeenCalled();
  } finally {
    await owner.dispose();
    jest.useRealTimers();
  }
});

test('an uninitialized runtime is skipped independently of an unreadable application database', async () => {
  const f = fixture();
  f.deps.applicationData = async () => {
    throw new Error('Database unavailable');
  };
  f.deps.runtimeStorage = async () => 'not_initialized';
  const owner = createDiagnosticsModule(f.deps);
  const report = await owner.module.createSession(f.context).check({ network: true });
  expect(report.checks).toEqual(
    expect.arrayContaining([
      { id: 'data', status: 'error', issue: 'unavailable' },
      { id: 'runtime', status: 'skipped', issue: 'not_initialized' },
      expect.objectContaining({ id: 'endpoint', status: 'pass' }),
    ]),
  );
  await owner.dispose();
});

test('cancelled checks never publish the late result of an uncancellable read', async () => {
  const f = fixture();
  let release!: (value: { missingCount: number }) => void;
  let started!: () => void;
  const admitted = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.deps.applicationData = () =>
    new Promise((resolve) => {
      release = resolve;
      started();
    });
  const owner = createDiagnosticsModule(f.deps);
  const session = owner.module.createSession(f.context);
  const observed: { id: string; status: string }[] = [];
  const pending = session.check({ onCheck: (check) => observed.push(check) });
  const stopped = expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
  await admitted;
  session.cancel();
  await stopped;
  const count = observed.length;
  release({ missingCount: 1 });
  await Promise.resolve();
  expect(observed).toHaveLength(count);
  await owner.dispose();
});
