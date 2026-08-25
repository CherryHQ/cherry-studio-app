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
  useLocalSearchParams: () => ({ assistantId: 'assistant-1', topicId: 'topic-1' }),
}));

jest.mock('@/frontend/components/headers', () => ({ MainHeader: () => null }));

jest.mock('@/frontend/hooks/chat', () => ({
  useMessages: () => ({ isLoadingInitial: false, messages: [] }),
  useTopic: () => ({ data: { id: 'topic-1' }, isError: false, isLoading: false }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ debug: jest.fn() }) },
}));

jest.mock('@/shared/devBench/layoutBenchProbe', () => ({
  armLayoutBenchProbe: jest.fn(),
  LAYOUT_BENCH_ASSISTANT_ID: 'benchmark-assistant',
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
      assistantId: 'assistant-1',
      dismissKeyboardOnSend: false,
      topicId: 'topic-1',
    });
  });
});
