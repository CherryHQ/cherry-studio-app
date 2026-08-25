import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatScreen } from '../ChatScreen';

const mockHandleInputHeightChange = jest.fn();
const mockInputHeightShared = { value: 122 };
let chatInputProps: Record<string, unknown> | undefined;
let chatWorkspaceProps: Record<string, unknown> | undefined;
let dockProps: Record<string, unknown> | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  Composer: {
    Dock: ({ children, ...props }: { children?: React.ReactNode }) => {
      dockProps = props;
      return children;
    },
  },
  useComposerDockLayout: () => ({
    contentBottomInset: 130,
    handleInputHeightChange: mockHandleInputHeightChange,
    inputHeight: 122,
    inputHeightShared: mockInputHeightShared,
    keyboardOffset: 26,
  }),
}));

jest.mock('@/frontend/components/composer', () => ({
  ComposerSessionProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useLocalSearchParams: () => ({ agentId: 'agent-1', sessionId: 'session-1' }),
}));

jest.mock('@/frontend/components/headers', () => ({ MainHeader: () => null }));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: () => ({ agent: { id: 'agent-1' }, isLoading: false }),
  useAgentMessageHistoryWindow: () => ({
    isLoadingInitial: false,
    isLoadingOlder: false,
    loadOlder: jest.fn(),
    messages: [],
    retry: jest.fn(),
  }),
  useAgentSession: () => ({
    data: { agentId: 'agent-1', id: 'session-1' },
    isLoading: false,
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
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shares CherryUI dock measurements with the workspace and composer', () => {
    act(() => {
      renderer = create(<ChatScreen />);
    });

    expect(chatWorkspaceProps).toMatchObject({
      bottomAccessoryHeight: mockInputHeightShared,
      contentBottomInset: 130,
      keyboardOffset: 26,
    });
    expect(dockProps).toMatchObject({
      onHeightChange: mockHandleInputHeightChange,
    });
    expect(chatInputProps).toMatchObject({
      agentId: 'agent-1',
      dismissKeyboardOnSend: false,
      sessionId: 'session-1',
    });
  });
});
