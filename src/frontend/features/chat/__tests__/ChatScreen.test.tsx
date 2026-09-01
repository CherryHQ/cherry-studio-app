import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiErrorFactory } from '@/shared/data/api/errors';

import { ChatScreen } from '../ChatScreen';

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

jest.mock('@/frontend/components/composer', () => ({
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
    error: mockSessionError,
    isLoading: mockSessionIsLoading,
    refetch: mockSessionRefetch,
  }),
}));

jest.mock('../input', () => ({
  ChatInput: (props: Record<string, unknown>) => {
    chatInputProps = props;
    return null;
  },
}));

jest.mock('../navigation', () => ({
  ChatRouteResolver: () => {
    mockRouteResolverRendered = true;
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
      dismissKeyboardOnSend: false,
      sessionId: 'session-1',
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
