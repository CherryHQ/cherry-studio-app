import type { AiService } from '@/backend/ai/AiService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@/shared/data/presets/cherryai';

import { AgentSessionNaming } from '../AgentSessionNaming';
import { InMemoryAgentSessionStore } from '../InMemoryAgentSessionStore';

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createNaming(input: {
  generateText?: AiService['generateText'];
  namingEnabled?: boolean;
  signal?: AbortSignal;
}) {
  const store = new InMemoryAgentSessionStore();
  const generateText = jest.fn(input.generateText ?? (async () => ({ text: 'Generated summary' })));
  const preference = {
    get: jest.fn(async (key: string) => {
      if (key === 'agent.session_naming.enabled') return input.namingEnabled ?? true;
      if (key === 'agent.session_naming.model_id') return null;
      if (key === 'agent.session_naming.prompt') return '';
      if (key === 'app.language') return 'en-us';
      return null;
    }),
  } as unknown as PreferenceService;
  const naming = new AgentSessionNaming({
    ai: { generateText } as Pick<AiService, 'generateText'>,
    model: { getById: jest.fn() } as unknown as Pick<ModelService, 'getById'>,
    preference,
    provider: {
      getByProviderId: jest.fn(),
    } as unknown as Pick<ProviderService, 'getByProviderId'>,
    ...(input.signal ? { signal: input.signal } : {}),
    store,
  });
  return { generateText, naming, store };
}

describe('AgentSessionNaming', () => {
  test('uses the first user message as a temporary automatic title', async () => {
    const { generateText, naming, store } = createNaming({});
    const session = await store.createSession({ agentId: 'agent-1' });

    const renamed = await naming.maybeRenameFromFirstUserMessage(session.id, [
      { type: 'text', text: '  A useful first message  ' },
    ]);

    expect(renamed).toMatchObject({
      id: session.id,
      title: 'A useful first message',
      titleIsManual: false,
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  test('replaces the temporary title with a first-exchange summary', async () => {
    const { generateText, naming, store } = createNaming({});
    const session = await store.createSession({ agentId: 'agent-1' });
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    const renamed = await naming.maybeRenameFromConversationSummary({
      assistantParts: [
        { id: 'text-1', state: 'done', text: 'Earth blocks sunlight from the Moon.', type: 'text' },
      ],
      sessionId: session.id,
      userParts,
    });

    expect(renamed).toMatchObject({ title: 'Generated summary', titleIsManual: false });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: 'none',
        uniqueModelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
      }),
    );
  });

  test('propagates the Host lifecycle signal to summary generation', async () => {
    const controller = new AbortController();
    const { generateText, naming, store } = createNaming({ signal: controller.signal });
    const session = await store.createSession({ agentId: 'agent-1' });
    const userParts = [{ type: 'text' as const, text: 'Explain lunar eclipses' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    await naming.maybeRenameFromConversationSummary({
      assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
      sessionId: session.id,
      userParts,
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ requestOptions: { signal: controller.signal } }),
    );
  });

  test('does not overwrite a manual rename that wins the generation race', async () => {
    const generationStarted = deferred<void>();
    const generated = deferred<{ text: string }>();
    const { naming, store } = createNaming({
      generateText: async () => {
        generationStarted.resolve();
        return generated.promise;
      },
    });
    const session = await store.createSession({ agentId: 'agent-1' });
    const userParts = [{ type: 'text' as const, text: 'First question' }];
    await naming.maybeRenameFromFirstUserMessage(session.id, userParts);

    const summary = naming.maybeRenameFromConversationSummary({
      assistantParts: [{ id: 'text-1', state: 'done', text: 'First answer', type: 'text' }],
      sessionId: session.id,
      userParts,
    });
    await generationStarted.promise;
    await store.renameSession(session.id, 'My title');
    generated.resolve({ text: 'Too late' });

    await expect(summary).resolves.toBeNull();
    await expect(store.getSession(session.id)).resolves.toMatchObject({
      title: 'My title',
      titleIsManual: true,
    });
  });

  test('keeps the first-message title when summary naming is disabled', async () => {
    const { generateText, naming, store } = createNaming({ namingEnabled: false });
    const session = await store.createSession({ agentId: 'agent-1' });
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
      title: 'First question',
      titleIsManual: false,
    });
  });
});
