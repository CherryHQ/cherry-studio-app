import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatScreen } from '../ChatScreen';

let chatInputProps: Record<string, unknown> | undefined;
let chatWorkspaceProps: Record<string, unknown> | undefined;
let dockProps: Record<string, unknown> | undefined;
let mockSessionData: { agentId: string; id: string } | undefined;
let mockSessionIsLoading: boolean;

jest.mock('@cherrystudio/ui/components', () => ({
  composerContentGap: 8,
  getComposerKeyboardStickyOffset: () => 26,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/frontend/components/composer', () => ({
  ComposerDock: ({ children, ...props }: { children?: React.ReactNode }) => {
    dockProps = props;
    return children;
  },
  ComposerSessionProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useLocalSearchParams: () => ({ agentId: 'agent-1', sessionId: 'session-1' }),
}));

jest.mock('@/frontend/components/headers', () => ({ MainHeader: () => null }));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (agentId: string | undefined) => ({
    agent: agentId === 'agent-1' ? { id: 'agent-1' } : undefined,
    isLoading: false,
  }),
  useAgentMessageHistoryWindow: () => ({
    isLoadingInitial: false,
    isLoadingOlder: false,
    loadOlder: jest.fn(),
    messages: [],
    retry: jest.fn(),
  }),
  useAgentSession: () => ({
    data: mockSessionData,
    isLoading: mockSessionIsLoading,
  }),
}));

jest.mock('../input', () => ({
  ChatInput: (props: Record<string, unknown>) => {
    chatInputProps = props;
    return null;
  },
}));

jest.mock('../workspace', () => ({
  ChatEmptyState: () => null,
  ChatWorkspace: (props: Record<string, unknown>) => {
    chatWorkspaceProps = props;
    return null;
  },
}));

describe('ChatScreen composer dock wiring', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    chatInputProps = undefined;
    chatWorkspaceProps = undefined;
    dockProps = undefined;
    mockSessionData = { agentId: 'agent-1', id: 'session-1' };
    mockSessionIsLoading = false;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the composer in normal flow and shares only keyboard geometry', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatWorkspaceProps).toMatchObject({
      contentBottomInset: 8,
      keyboardOffset: 26,
    });
    expect(dockProps).toMatchObject({
      layoutMode: 'flow',
    });
    expect(dockProps?.onHeightChange).toBeUndefined();
    expect(chatInputProps).toMatchObject({
      agentId: 'agent-1',
      dismissKeyboardOnSend: false,
      sessionId: 'session-1',
    });
  });

  it('keeps the route Agent while a newly created Session is loading', () => {
    mockSessionData = undefined;
    mockSessionIsLoading = true;

    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatInputProps).toMatchObject({
      agentId: 'agent-1',
      sessionId: 'session-1',
    });
  });
});
