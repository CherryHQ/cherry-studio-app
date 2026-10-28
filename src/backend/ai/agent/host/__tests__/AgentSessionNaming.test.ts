import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import type { LanguageVarious } from '@/shared/data/preference';

import type { RuntimeTextGenerator, RuntimeUsageReport } from '../../runtime';
import {
  createSqliteStoreHarness,
  type SqliteStoreHarness,
} from '../../sessionStore/__tests__/_sqliteStoreHarness';
import { AgentSessionNaming } from '../AgentSessionNaming';

const DEFAULT_NAMING_MODEL_ID = 'openai::gpt-4o';

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const harnesses: SqliteStoreHarness[] = [];
afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup();
});

function createNaming(input: {
  appLanguage?: LanguageVarious;
  defaultModelId?: string | null;
  generateText?: RuntimeTextGenerator['generateText'];
  namingModelId?: string | null;
  namingEnabled?: boolean;
  onUsage?: (report: RuntimeUsageReport) => Promise<void>;
  providerAuthMethods?: string[];
  signal?: AbortSignal;
}) {
  const harness = createSqliteStoreHarness();
  harnesses.push(harness);
  const { store } = harness;
  const agentId = harness.seedAgent();
  const createEmptySession = () => harness.createEmptySession({ agentId });
  const generateText = jest.fn<
    ReturnType<RuntimeTextGenerator['generateText']>,
    Parameters<RuntimeTextGenerator['generateText']>
  >(input.generateText ?? (async () => ({ finishReason: 'stop', text: 'Generated summary' })));
  const defaultModelId =
    input.defaultModelId === undefined ? DEFAULT_NAMING_MODEL_ID : input.defaultModelId;
  const preference = {
    get: jest.fn(async (key: string) => {
      if (key === 'agent.session_naming.enabled') return input.namingEnabled ?? true;
      if (key === 'agent.session_naming.model_id') return input.namingModelId ?? null;
      if (key === 'agent.default_model_id') return defaultModelId;
      if (key === 'agent.session_naming.prompt') return '';
      return null;
    }),
  } as unknown as PreferenceService;
  const naming = new AgentSessionNaming({
    ai: { generateText },
    appLanguage: () => input.appLanguage ?? 'en-US',
    model: { getById: jest.fn(async () => ({})) } as unknown as Pick<ModelService, 'getById'>,
    preference,
    onUsage: input.onUsage,
    provider: {
      getByProviderId: jest.fn(async () => ({ authMethods: input.providerAuthMethods ?? [] })),
    } as unknown as Pick<ProviderService, 'getByProviderId'>,
    ...(input.signal ? { signal: input.signal } : {}),
    store,
  });
  return { createEmptySession, generateText, naming, store };
}

describe('AgentSessionNaming', () => {
  test('uses the first user message as a temporary automatic title', async () => {
    const { createEmptySession, generateText, naming } = createNaming({});
    const session = await createEmptySession();

    const renamed = await naming.maybeRenameFromFirstUserMessage(session.id, [
      { type: 'text', text: '  A useful first message  ' },
    ]);

    expect(renamed).toMatchObject({
      id: session.id,
      name: 'A useful first message',
      isNameManuallyEdited: false,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  test('replaces the temporary title with a first-exchange summary', async () => {
    const { createEmptySession, generateText, naming } = createNaming({});
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    const renamed = await naming.maybeRenameFromConversationSummary({
      assistantParts: [
        { id: 'text-1', state: 'done', text: 'Earth blocks sunlight from the Moon.', type: 'text' },
      ],
      sessionId: session.id,
      userParts,
    });

    expect(renamed).toMatchObject({ name: 'Generated summary', isNameManuallyEdited: false });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { providerId: 'openai', modelId: 'gpt-4o' },
        options: { reasoningEffort: 'none' },
      }),
      expect.any(Object),
    );
  });

  test('uses the effective App language in the summary naming prompt', async () => {
    const { createEmptySession, generateText, naming } = createNaming({
      appLanguage: 'zh-CN',
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    await naming.maybeRenameFromConversationSummary({
      assistantParts: [
        { id: 'text-1', state: 'done', text: 'Earth blocks the sunlight.', type: 'text' },
      ],
      sessionId: session.id,
      userParts,
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('title in zh-CN'),
      }),
      expect.any(Object),
    );
  });

  test('uses the OAuth naming model and forwards its invocation usage', async () => {
    const report: RuntimeUsageReport = {
      requestId: 'naming-request',
      completedAt: 1,
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      context: {
        providerId: 'openai-codex',
        providerName: 'OpenAI Codex',
        modelId: 'naming-model',
        modelName: 'Naming model',
        pricingSnapshot: null,
        trustProviderReportedCost: false,
        reportedCostCurrency: null,
        credentialReceipt: { attribution: 'unknown' },
      },
    };
    const onUsage = jest.fn(async (_report: RuntimeUsageReport) => {});
    const { createEmptySession, generateText, naming } = createNaming({
      namingModelId: 'openai-codex::naming-model',
      providerAuthMethods: ['oauth'],
      onUsage,
      generateText: async (_request, options) => {
        await options?.onUsage?.(report);
        return { finishReason: 'stop', text: 'Lunar eclipses' };
      },
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);
    await expect(
      naming.maybeRenameFromConversationSummary({
        assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
        sessionId: session.id,
        userParts,
      }),
    ).resolves.toMatchObject({ name: 'Lunar eclipses', isNameManuallyEdited: false });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { providerId: 'openai-codex', modelId: 'naming-model' },
      }),
      expect.any(Object),
    );
    expect(onUsage).toHaveBeenCalledWith(report);
  });

  test.each([
    { finishReason: 'length', text: 'Truncated title' },
    { finishReason: 'toolUse', text: 'Unexpected tool title' },
    { finishReason: 'error', text: 'Partial title' },
    { finishReason: 'stop', text: '   ' },
  ])('keeps the temporary title after unusable summary output: %p', async (result) => {
    const { createEmptySession, naming, store } = createNaming({
      generateText: async () => result,
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'First question' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);
    await expect(
      naming.maybeRenameFromConversationSummary({
        assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
        sessionId: session.id,
        userParts,
      }),
    ).resolves.toBeNull();
    await expect(store.getSession(session.id)).resolves.toMatchObject({ name: 'First question' });
  });

  test('keeps the first-message title when no usable naming model is configured', async () => {
    const { createEmptySession, generateText, naming, store } = createNaming({
      defaultModelId: null,
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    await expect(
      naming.maybeRenameFromConversationSummary({
        assistantParts: [
          { id: 'text-1', state: 'done', text: 'Earth blocks the sunlight.', type: 'text' },
        ],
        sessionId: session.id,
        userParts,
      }),
    ).resolves.toBeNull();

    expect(generateText).not.toHaveBeenCalled();
    await expect(store.getSession(session.id)).resolves.toMatchObject({
      name: 'Explain lunar eclipses',
      isNameManuallyEdited: false,
    });
  });

  test('propagates the Host lifecycle signal to summary generation', async () => {
    const controller = new AbortController();
    const { createEmptySession, generateText, naming } = createNaming({
      signal: controller.signal,
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    await naming.maybeRenameFromConversationSummary({
      assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
      sessionId: session.id,
      userParts,
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  test('does not overwrite a manual rename that wins the generation race', async () => {
    const generationStarted = deferred<void>();
    const generated = deferred<Awaited<ReturnType<RuntimeTextGenerator['generateText']>>>();
    const { createEmptySession, naming, store } = createNaming({
      generateText: async () => {
        generationStarted.resolve();
        return generated.promise;
      },
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'First question' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    const summary = naming.maybeRenameFromConversationSummary({
      assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
      sessionId: session.id,
      userParts,
    });
    await generationStarted.promise;
    await store.renameSession(session.id, 'My title');
    generated.resolve({ finishReason: 'stop', text: 'Too late' });

    await expect(summary).resolves.toBeNull();
    await expect(store.getSession(session.id)).resolves.toMatchObject({
      name: 'My title',
      isNameManuallyEdited: true,
    });
  });

  test('ignores a summary that finishes after Host cancellation', async () => {
    const controller = new AbortController();
    const generationStarted = deferred<void>();
    const generated = deferred<Awaited<ReturnType<RuntimeTextGenerator['generateText']>>>();
    const { createEmptySession, naming, store } = createNaming({
      signal: controller.signal,
      generateText: async () => {
        generationStarted.resolve();
        return generated.promise;
      },
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'First question' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);
    const summary = naming.maybeRenameFromConversationSummary({
      assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
      sessionId: session.id,
      userParts,
    });
    await generationStarted.promise;
    controller.abort();
    generated.resolve({ finishReason: 'stop', text: 'Too late' });
    await expect(summary).resolves.toBeNull();
    await expect(store.getSession(session.id)).resolves.toMatchObject({ name: 'First question' });
  });

  test('keeps the first-message title when summary naming is disabled', async () => {
    const { createEmptySession, generateText, naming, store } = createNaming({
      namingEnabled: false,
    });
    const session = await createEmptySession();
    const userParts = [{ type: 'text' as const, text: 'First question' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    await expect(
      naming.maybeRenameFromConversationSummary({
        assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
        sessionId: session.id,
        userParts,
      }),
    ).resolves.toBeNull();
    expect(generateText).not.toHaveBeenCalled();
    await expect(store.getSession(session.id)).resolves.toMatchObject({
      name: 'First question',
      isNameManuallyEdited: false,
    });
  });
});
