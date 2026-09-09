import { useEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatProvider, useAgentChatControls, useAgentChatDraftHandoff } from '../ChatProvider';

const mockDispose = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRefreshObservedSessions = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockStartSession = jest.fn();
const mockSubmitMessage = jest.fn();
const mockChatState = { status: 'ready', activeTurn: null };
const mockSubscribe = jest.fn(() => () => undefined);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    agentSessions: {
      all: () => ['agent-sessions'],
      detail: (sessionId: string) => ['agent-sessions', sessionId],
      messages: (sessionId: string) => ['agent-sessions', sessionId, 'messages'],
    },
  },
  useBackendModule: () => ({}),
}));

jest.mock('@/frontend/components/Message', () => ({
  ToolInputPreviewProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../AgentSessionChatClient', () => ({
  AgentSessionChatClient: jest.fn().mockImplementation(() => ({
    dispose: mockDispose,
    refreshObservedSessions: mockRefreshObservedSessions,
    startSession: mockStartSession,
    submitMessage: mockSubmitMessage,
    getState: () => mockChatState,
    subscribe: mockSubscribe,
  })),
}));

type AgentChatControls = ReturnType<typeof useAgentChatControls>;

let chatControls: AgentChatControls | undefined;
let draftHandoff: ReturnType<typeof useAgentChatDraftHandoff>;

function Probe({ sessionId, composerKey = 0 }: { sessionId?: string; composerKey?: number }) {
  const controls = useAgentChatControls({ agentId: 'agent-1', sessionId, composerKey });
  const handoff = useAgentChatDraftHandoff(sessionId);

  useEffect(() => {
    captureChatControls(controls);
  }, [controls]);
  useEffect(() => {
    captureDraftHandoff(handoff);
  }, [handoff]);

  return null;
}

function Harness({ sessionId, composerKey }: { sessionId?: string; composerKey?: number }) {
  return (
    <ChatProvider>
      <Probe sessionId={sessionId} composerKey={composerKey} />
    </ChatProvider>
  );
}

describe('ChatProvider Draft handoff', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    chatControls = undefined;
    draftHandoff = undefined;
    mockStartSession.mockImplementation(async (input) => ({ id: input.sessionId }));
    mockSubmitMessage.mockResolvedValue({});
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('publishes the admitted Draft to the destination Session for one render', async () => {
    act(() => {
      renderer = create(<Harness />);
    });

    await act(async () => {
      await currentControls().sendMessage({ parts: [{ text: 'Hello', type: 'text' }] });
    });

    const { sessionId } = mockStartSession.mock.calls[0][0];
    expect(mockSetParams).toHaveBeenCalledWith({ agentId: undefined, sessionId });
    const pending = currentControls().pendingSend;

    act(() => {
      renderer?.update(<Harness sessionId={sessionId} />);
    });

    expect(draftHandoff).toEqual({ agentId: 'agent-1', sessionId });
    expect(currentControls().pendingSend).toBe(pending);

    act(() => {
      renderer?.update(<Harness sessionId="session-2" />);
    });

    expect(draftHandoff).toBeUndefined();

    act(() => {
      renderer?.update(<Harness sessionId={sessionId} />);
    });

    expect(draftHandoff).toBeUndefined();
  });

  it.each([undefined, 'session-1'])(
    'shows the same row IDs before %s sends complete and retains them until displayed',
    async (sessionId) => {
      const admission = deferred<void>();
      mockStartSession.mockImplementation(async (input) => {
        await admission.promise;
        return { id: input.sessionId };
      });
      mockSubmitMessage.mockImplementation(() => admission.promise);
      act(() => {
        renderer = create(<Harness sessionId={sessionId} />);
      });
      let sending!: Promise<void>;
      act(() => {
        sending = currentControls().sendMessage({
          parts: [
            { type: 'text', text: 'Hello' },
            {
              type: 'file',
              fileEntryId: 'file-1',
              mediaType: 'application/pdf',
              name: 'notes.pdf',
            },
          ],
        });
      });
      const pending = currentControls().pendingSend!;
      const request = (sessionId ? mockSubmitMessage : mockStartSession).mock.calls[0][0];
      expect(pending.isSubmitting).toBe(true);
      expect(currentControls().canSend).toBe(false);
      expect(pending.sessionId).toBe(request.sessionId);
      expect(pending.messages.map((message) => message.id)).toEqual([
        request.userMessageId,
        request.assistantMessageId,
      ]);
      expect(pending.messages[0].data.parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: 'Hello' }),
          expect.objectContaining({
            type: 'file',
            filename: 'notes.pdf',
            mediaType: 'application/pdf',
          }),
        ]),
      );
      act(() => currentControls().completePendingSend(request.userMessageId));
      expect(currentControls().pendingSend).toBe(pending);
      await act(async () => {
        admission.resolve();
        await sending;
      });
      expect(currentControls().pendingSend).toMatchObject({
        isSubmitting: false,
        messages: pending.messages,
      });
      act(() => currentControls().completePendingSend(request.userMessageId));
      expect(currentControls().pendingSend).toBeUndefined();
      expect(currentControls().enteringUserMessageId).toBe(request.userMessageId);
    },
  );

  it('withdraws a rejected send, keeps its scroll intent stable, and allows the next send', async () => {
    const admission = deferred<void>();
    mockStartSession.mockImplementationOnce(() => admission.promise);
    act(() => {
      renderer = create(<Harness />);
    });
    let sending!: Promise<void>;
    act(() => {
      sending = currentControls().sendMessage({ parts: [{ type: 'text', text: 'Hello' }] });
    });
    const messageId = currentControls().pendingSend!.messages[0].id;
    await act(async () => {
      const failed = expect(sending).rejects.toThrow('rejected');
      admission.reject(new Error('rejected'));
      await failed;
    });
    expect(currentControls().pendingSend).toBeUndefined();
    expect(currentControls().canSend).toBeUndefined();
    expect(currentControls().enteringUserMessageId).toBe(messageId);
    expect(mockSetParams).not.toHaveBeenCalled();
    await act(async () => {
      await currentControls().sendMessage({ parts: [{ type: 'text', text: 'Retry' }] });
    });
    expect(currentControls().pendingSend!.messages[0].id).not.toBe(messageId);
  });

  it('isolates a later composer from an earlier send even when both target the same Agent', async () => {
    const first = deferred<void>();
    mockStartSession.mockImplementationOnce(async (input) => {
      await first.promise;
      return { id: input.sessionId };
    });
    act(() => {
      renderer = create(<Harness />);
    });
    let sending!: Promise<void>;
    act(() => {
      sending = currentControls().sendMessage({ parts: [{ type: 'text', text: 'Old' }] });
    });
    act(() => {
      renderer?.update(<Harness composerKey={1} />);
    });
    expect(currentControls().pendingSend).toBeUndefined();
    await act(async () => {
      await currentControls().sendMessage({ parts: [{ type: 'text', text: 'New' }] });
    });
    const current = currentControls().pendingSend;
    mockSetParams.mockClear();
    await act(async () => {
      first.resolve();
      await sending;
    });
    expect(currentControls().pendingSend).toBe(current);
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('keeps the current route when a Draft finishes after its composer unmounts', async () => {
    let accept!: (session: { id: string }) => void;
    mockStartSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    act(() => {
      renderer = create(<Harness />);
    });
    let sending!: Promise<void>;
    act(() => {
      sending = currentControls().sendMessage({ parts: [{ text: 'Hello', type: 'text' }] });
    });
    act(() => {
      renderer?.unmount();
      renderer = undefined;
    });
    await act(async () => {
      accept({ id: 'session-1' });
      await sending;
    });
    expect(mockSetParams).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });
});

function captureChatControls(value: AgentChatControls) {
  chatControls = value;
}

function captureDraftHandoff(value: ReturnType<typeof useAgentChatDraftHandoff>) {
  draftHandoff = value;
}

function currentControls() {
  if (!chatControls) {
    throw new Error('useAgentChatControls probe was not rendered.');
  }

  return chatControls;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
