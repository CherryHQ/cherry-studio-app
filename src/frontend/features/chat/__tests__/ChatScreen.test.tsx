import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiErrorFactory } from '@/shared/data/api/errors';

import { ChatScreen } from '../ChatScreen';

let chatControlsInput: { agentId?: string; composerKey: number; sessionId?: string } | undefined;
let chatInputProps: Record<string, unknown> | undefined;
let chatWorkspaceProps: Record<string, unknown> | undefined;
let dockProps: Record<string, unknown> | undefined;
let mockRouteResolverRendered: boolean;
let mockComposerProviderInstance: number | undefined;
let mockComposerProviderMountCount: number;
let mockRouteParams: { agentId?: string; sessionId?: string };
let mockSessionData: { agentId: string; id: string } | undefined;
let mockSessionError: Error | undefined;
let mockSessionIsLoading: boolean;
const mockSessionRefetch = jest.fn();
const mockDismissInput = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  composerContentGap: 8,
  ContentState: {
    Error: () => null,
  },
  getComposerKeyboardStickyOffset: () => 26,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/Composer', () => ({
  ComposerDock: ({ children, ...props }: { children?: React.ReactNode }) => {
    dockProps = props;
    return children;
  },
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
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/frontend/appShell/header', () => ({ MainHeader: () => null }));

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
    error: mockSessionError,
    isLoading: mockSessionIsLoading,
    refetch: mockSessionRefetch,
  }),
}));

const mockChatControls = {
  cancel: jest.fn(),
  canSend: undefined,
  completePendingSend: jest.fn(),
  enteringUserMessageId: undefined,
  isApprovalPending: false,
  isBusy: false,
  pendingSend: undefined,
  sendMessage: jest.fn(),
};

jest.mock('../runtime', () => ({
  useAgentChatControls: (input: { agentId?: string; composerKey: number; sessionId?: string }) => {
    chatControlsInput = input;
    return mockChatControls;
  },
  useAgentChatDraftHandoff: () => undefined,
}));

jest.mock('../hooks/useSessionReadReceipt', () => ({ useSessionReadReceipt: jest.fn() }));

jest.mock('../components/ChatInput', () => ({
  ChatInput: (props: Record<string, unknown>) => {
    const { useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
    useImperativeHandle(props.ref as React.Ref<{ dismiss: () => void }>, () => ({
      dismiss: mockDismissInput,
    }));
    chatInputProps = props;
    return null;
  },
}));

jest.mock('../components/ChatRouteResolver', () => ({
  ChatRouteResolver: () => {
    mockRouteResolverRendered = true;
    return null;
  },
}));

jest.mock('../components/ChatWorkspace', () => ({
  ChatDraftState: () => null,
  ChatEmptyState: () => null,
  ChatWorkspace: (props: Record<string, unknown>) => {
    chatWorkspaceProps = props;
    return null;
  },
}));

describe('ChatScreen composer dock wiring', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockDismissInput.mockClear();
    chatControlsInput = undefined;
    chatInputProps = undefined;
    chatWorkspaceProps = undefined;
    dockProps = undefined;
    mockRouteResolverRendered = false;
    mockComposerProviderInstance = undefined;
    mockComposerProviderMountCount = 0;
    mockRouteParams = { agentId: 'agent-1', sessionId: 'session-1' };
    mockSessionData = { agentId: 'agent-1', id: 'session-1' };
    mockSessionError = undefined;
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
      controls: mockChatControls,
      dismissKeyboardOnSend: false,
      sessionId: 'session-1',
    });
    expect(chatWorkspaceProps).toMatchObject({
      onPendingSendDisplayed: mockChatControls.completePendingSend,
    });
  });

  it.each(['session', 'draft'] as const)(
    'dismisses the %s composer on a completed background press, but yields to cancelled gestures',
    (target) => {
      if (target === 'draft') {
        mockRouteParams = { agentId: 'agent-1' };
        mockSessionData = undefined;
      }
      act(() => {
        renderer = create(<ChatScreen />);
      });
      const background = renderer!.root.find(
        (node) => typeof node.type === 'string' && node.props.testID === 'chat-background',
      );
      const nativeTarget = {
        measure: (callback: (...bounds: number[]) => void) => callback(0, 0, 400, 800, 0, 0),
      };
      const event = {
        currentTarget: nativeTarget,
        nativeEvent: { pageX: 100, pageY: 100 },
        persist: jest.fn(),
        target: nativeTarget,
      };

      act(() => background.props.onResponderGrant(event));
      expect(mockDismissInput).not.toHaveBeenCalled();
      // A native scroll/selection recognizer can cancel this candidate press.
      expect(background.props.onResponderTerminationRequest()).toBe(true);
      act(() => background.props.onResponderTerminate(event));
      expect(mockDismissInput).not.toHaveBeenCalled();

      act(() => {
        background.props.onResponderGrant(event);
        background.props.onResponderRelease(event);
      });
      expect(mockDismissInput).toHaveBeenCalledTimes(1);
    },
  );

  it('keys the chat controls by the composer identity', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });
    expect(chatControlsInput).toEqual({
      agentId: 'agent-1',
      composerKey: 0,
      sessionId: 'session-1',
    });

    mockRouteParams = { agentId: 'agent-1', sessionId: 'session-2' };
    mockSessionData = { agentId: 'agent-1', id: 'session-2' };
    act(() => {
      renderer?.update(<ChatScreen />);
    });

    expect(chatControlsInput).toEqual({
      agentId: 'agent-1',
      composerKey: 1,
      sessionId: 'session-2',
    });
  });

  it('waits for the Session entity before enabling its composer', () => {
    mockSessionData = undefined;
    mockSessionIsLoading = true;

    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatInputProps).toBeUndefined();
    expect(chatWorkspaceProps).toMatchObject({ sessionId: 'session-1' });
  });

  it('restores the latest Session when the requested Session is missing', () => {
    mockSessionData = undefined;
    mockSessionError = DataApiErrorFactory.notFound('AgentSession', 'session-1');

    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(mockRouteResolverRendered).toBe(true);
    expect(chatInputProps).toBeUndefined();
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
