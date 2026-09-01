import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatScreen } from '../ChatScreen';

let chatInputProps: Record<string, unknown> | undefined;
let chatWorkspaceProps: Record<string, unknown> | undefined;
let mockAgentExists: boolean;
let mockComposerProviderInstance: number | undefined;
let mockComposerProviderMountCount: number;
let mockRouteParams: { agentId?: string; sessionId?: string };
let mockSessionData: { agentId: string; id: string } | undefined;
let mockSessionIsLoading: boolean;
let mockToolApprovalGateProps: { hasChildren: boolean; sessionId: string } | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  composerContentGap: 8,
  getComposerKeyboardStickyOffset: () => 26,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/frontend/components/composer', () => ({
  ComposerDock: ({ children }: { children?: React.ReactNode }) => children,
  ComposerSessionProvider: ({ children }: { children?: React.ReactNode }) => {
    const { useState } = jest.requireActual<typeof import('react')>('react');
    const [instance] = useState(() => ++mockComposerProviderMountCount);
    mockComposerProviderInstance = instance;
    return children;
  },
}));

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('@/frontend/components/headers', () => ({ MainHeader: () => null }));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (agentId: string | undefined) => ({
    agent: mockAgentExists && agentId === 'agent-1' ? { id: 'agent-1' } : undefined,
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

jest.mock('../approval/ToolApprovalGate', () => ({
  ToolApprovalGate: ({
    children,
    sessionId,
  }: {
    children?: React.ReactNode;
    sessionId: string;
  }) => {
    mockToolApprovalGateProps = {
      hasChildren: children !== null && children !== undefined,
      sessionId,
    };
    return children;
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
    mockAgentExists = true;
    mockComposerProviderInstance = undefined;
    mockComposerProviderMountCount = 0;
    mockRouteParams = { agentId: 'agent-1', sessionId: 'session-1' };
    mockSessionData = { agentId: 'agent-1', id: 'session-1' };
    mockSessionIsLoading = false;
    mockToolApprovalGateProps = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the Session composer wired to the approval gate and shares keyboard geometry', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatWorkspaceProps).toMatchObject({
      contentBottomInset: 8,
      keyboardOffset: 26,
    });
    expect(mockToolApprovalGateProps).toEqual({ hasChildren: true, sessionId: 'session-1' });
    expect(chatInputProps).toMatchObject({
      agentId: 'agent-1',
      dismissKeyboardOnSend: false,
      sessionId: 'session-1',
    });
  });

  it('keeps the Session approval gate after its Agent is deleted', () => {
    mockAgentExists = false;

    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatWorkspaceProps?.sessionId).toBe('session-1');
    expect(chatInputProps).toBeUndefined();
    expect(mockToolApprovalGateProps).toEqual({ hasChildren: false, sessionId: 'session-1' });
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

  it('isolates a new Draft composer from the established Session composer', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });
    expect(mockComposerProviderInstance).toBe(1);

    mockRouteParams = { agentId: 'agent-1' };
    mockSessionData = undefined;
    act(() => renderer?.update(<ChatScreen />));

    expect(mockComposerProviderInstance).toBe(2);
  });

  it('starts a fresh composer session when the route switches Sessions', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });
    expect(mockComposerProviderInstance).toBe(1);

    mockRouteParams = { agentId: 'agent-1', sessionId: 'session-2' };
    mockSessionData = { agentId: 'agent-1', id: 'session-2' };
    act(() => {
      renderer?.update(<ChatScreen />);
    });

    expect(mockComposerProviderInstance).toBe(2);
    expect(mockComposerProviderMountCount).toBe(2);
  });
});
