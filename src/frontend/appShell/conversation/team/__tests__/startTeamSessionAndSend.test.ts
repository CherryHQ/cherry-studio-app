import {
  TeamAgentError,
  teamDraftKey,
  type TeamAgentModule,
  type TeamConversation,
  type TeamSession,
  type TeamSubmitResult,
} from '@/shared/contracts/teamAgent';

import { startTeamSessionAndSend } from '../startTeamSessionAndSend';

function createFakeModule({
  contextKey = 'ctx-1',
  initialDraft = '',
  createSession = async (agentId: string) => ({
    agentId,
    sessionId: 'session-1',
    canDelete: true,
  }),
  refresh = async () => {},
  send = async () => 'accepted' as TeamSubmitResult,
}: {
  contextKey?: string | null;
  initialDraft?: string;
  createSession?: (agentId: string) => Promise<TeamSession>;
  refresh?: () => Promise<void>;
  send?: (input: string) => Promise<TeamSubmitResult>;
} = {}) {
  const drafts = new Map<string, string>();
  const draftKey = JSON.stringify([contextKey ?? 'ctx-1', 'agent-1']);
  if (initialDraft) drafts.set(draftKey, initialDraft);
  const dispose = jest.fn();
  const conversation: TeamConversation = {
    getState: () => ({ phase: 'current', view: null, submitting: false }),
    subscribe: () => () => {},
    refresh: jest.fn(refresh),
    setActive: jest.fn(),
    send: jest.fn(async (input) => {
      const result = await send(input);
      if (result === 'accepted' && currentContextKey) {
        const key = teamDraftKey(currentContextKey, { agentId: 'agent-1', sessionId: 'session-1' });
        if (drafts.get(key)?.trim() === input.trim()) drafts.delete(key);
      }
      return result;
    }),
    stop: jest.fn(async () => {}),
    respond: jest.fn(async () => {}),
    dispose,
  };
  let currentContextKey = contextKey;
  const module: TeamAgentModule = {
    getState: () => ({
      context: currentContextKey ? { bindingId: 'binding-1', key: currentContextKey } : null,
      phase: currentContextKey ? 'ready' : 'disabled',
      agents: [],
    }),
    subscribe: () => () => {},
    refresh: jest.fn(async () => {}),
    listSessions: jest.fn(async () => []),
    createSession: jest.fn(createSession),
    deleteSession: jest.fn(async () => {}),
    readDetail: jest.fn(async () => ({ skills: [], mcp: [] })),
    readPortrait: jest.fn(async () => undefined),
    observe: jest.fn(() => conversation),
    readDraft: (key) => drafts.get(key) ?? '',
    writeDraft: (key, text) => {
      if (text) drafts.set(key, text);
      else drafts.delete(key);
    },
  };
  return {
    module,
    drafts,
    draftKey,
    conversation,
    dispose,
    setContextKey: (next: string | null) => {
      currentContextKey = next;
    },
  };
}

describe('startTeamSessionAndSend', () => {
  it('creates a session, transfers the draft, sends, calls onSessionCreated, and disposes the observer', async () => {
    const fake = createFakeModule({ initialDraft: 'hello team' });
    const onSessionCreated = jest.fn();

    const result = await startTeamSessionAndSend({
      module: fake.module,
      contextKey: 'ctx-1',
      agentId: 'agent-1',
      text: 'hello team',
      draftKey: fake.draftKey,
      onSessionCreated,
    });

    expect(result).toEqual({
      session: { agentId: 'agent-1', sessionId: 'session-1', canDelete: true },
      status: 'accepted',
    });
    expect(fake.module.createSession).toHaveBeenCalledWith('agent-1');
    expect(fake.conversation.refresh).toHaveBeenCalledTimes(1);
    expect(fake.conversation.send).toHaveBeenCalledWith('hello team');
    expect(onSessionCreated).toHaveBeenCalledWith({
      agentId: 'agent-1',
      sessionId: 'session-1',
      canDelete: true,
    });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.drafts.size).toBe(0);
  });

  it('keeps the original draft intact and does not call onSessionCreated when createSession fails', async () => {
    const fake = createFakeModule({
      initialDraft: 'keep draft',
      createSession: async () => {
        throw new TeamAgentError('unavailable');
      },
    });
    const onSessionCreated = jest.fn();

    await expect(
      startTeamSessionAndSend({
        module: fake.module,
        contextKey: 'ctx-1',
        agentId: 'agent-1',
        text: 'keep draft',
        draftKey: fake.draftKey,
        onSessionCreated,
      }),
    ).rejects.toThrow(TeamAgentError);

    expect(onSessionCreated).not.toHaveBeenCalled();
    expect(fake.module.readDraft(fake.draftKey)).toBe('keep draft');
  });

  it('moves the draft to the created session key and invokes onSessionCreated on unknown submission', async () => {
    const fake = createFakeModule({
      initialDraft: 'ambiguous prompt',
      send: async () => 'unknown',
    });
    const onSessionCreated = jest.fn();

    const result = await startTeamSessionAndSend({
      module: fake.module,
      contextKey: 'ctx-1',
      agentId: 'agent-1',
      text: 'ambiguous prompt',
      draftKey: fake.draftKey,
      onSessionCreated,
    });

    expect(result.status).toBe('unknown');
    expect(onSessionCreated).toHaveBeenCalledTimes(1);
    expect(fake.module.readDraft(fake.draftKey)).toBe('');
    expect(
      fake.module.readDraft(teamDraftKey('ctx-1', { agentId: 'agent-1', sessionId: 'session-1' })),
    ).toBe('ambiguous prompt');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('switches to the created session and preserves the draft when refresh fails after session creation', async () => {
    const fake = createFakeModule({
      initialDraft: 'retry me',
      refresh: async () => {
        throw new TeamAgentError('offline');
      },
    });
    const onSessionCreated = jest.fn();

    await expect(
      startTeamSessionAndSend({
        module: fake.module,
        contextKey: 'ctx-1',
        agentId: 'agent-1',
        text: 'retry me',
        draftKey: fake.draftKey,
        onSessionCreated,
      }),
    ).rejects.toThrow(TeamAgentError);

    expect(onSessionCreated).toHaveBeenCalledWith({
      agentId: 'agent-1',
      sessionId: 'session-1',
      canDelete: true,
    });
    expect(
      fake.module.readDraft(teamDraftKey('ctx-1', { agentId: 'agent-1', sessionId: 'session-1' })),
    ).toBe('retry me');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('throws retired without creating a session when the context key no longer matches', async () => {
    const fake = createFakeModule({ contextKey: 'ctx-2', initialDraft: 'stale' });
    const onSessionCreated = jest.fn();

    await expect(
      startTeamSessionAndSend({
        module: fake.module,
        contextKey: 'ctx-1',
        agentId: 'agent-1',
        text: 'stale',
        draftKey: fake.draftKey,
        onSessionCreated,
      }),
    ).rejects.toMatchObject({ code: 'retired' });

    expect(fake.module.createSession).not.toHaveBeenCalled();
    expect(onSessionCreated).not.toHaveBeenCalled();
  });
});
