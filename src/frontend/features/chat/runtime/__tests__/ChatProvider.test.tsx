import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatProvider, useAgentChatControls, useAgentChatDraftHandoff } from '../ChatProvider';

const mockDispose = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRefreshObservedSessions = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockStartSession = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mockReplace, setParams: mockSetParams }),
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: () => ({ remove: jest.fn() }),
  },
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

jest.mock('../AgentSessionChatClient', () => ({
  AgentSessionChatClient: jest.fn().mockImplementation(() => ({
    dispose: mockDispose,
    refreshObservedSessions: mockRefreshObservedSessions,
    startSession: mockStartSession,
  })),
}));

type AgentChatControls = ReturnType<typeof useAgentChatControls>;

let chatControls: AgentChatControls | undefined;
let draftHandoff: ReturnType<typeof useAgentChatDraftHandoff>;

function Probe({ sessionId }: { sessionId?: string }) {
  const controls = useAgentChatControls({ agentId: 'agent-1' });
  const handoff = useAgentChatDraftHandoff(sessionId);

  useEffect(() => {
    captureChatControls(controls);
  }, [controls]);
  useEffect(() => {
    captureDraftHandoff(handoff);
  }, [handoff]);

  return null;
}

function Harness({ sessionId }: { sessionId?: string }) {
  return (
    <ChatProvider>
      <Probe sessionId={sessionId} />
    </ChatProvider>
  );
}

describe('ChatProvider Draft handoff', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    chatControls = undefined;
    draftHandoff = undefined;
    mockStartSession.mockResolvedValue({ id: 'session-1' });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('publishes the admitted Draft to the destination Session for one render', async () => {
    act(() => {
      renderer = create(<Harness />);
    });

    await act(async () => {
      await currentControls().sendMessage({ parts: [{ text: 'Hello', type: 'text' }] });
    });

    expect(mockSetParams).toHaveBeenCalledWith({ agentId: undefined, sessionId: 'session-1' });

    act(() => {
      renderer?.update(<Harness sessionId="session-1" />);
    });

    expect(draftHandoff).toEqual({ agentId: 'agent-1', sessionId: 'session-1' });

    act(() => {
      renderer?.update(<Harness sessionId="session-2" />);
    });

    expect(draftHandoff).toBeUndefined();

    act(() => {
      renderer?.update(<Harness sessionId="session-1" />);
    });

    expect(draftHandoff).toBeUndefined();
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
