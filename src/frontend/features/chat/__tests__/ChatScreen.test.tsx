import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatScreen } from '../ChatScreen';

type MockChatWorkspaceProps = { isPreview: boolean; topicId: string };

const mockChatWorkspace = jest.fn((_props: MockChatWorkspaceProps) => null);
let mockIsPreview = false;

jest.mock('expo-router', () => ({
  useIsPreview: () => mockIsPreview,
  useLocalSearchParams: () => ({ topicId: 'topic-1' }),
}));

jest.mock('@/frontend/components/headers', () => ({ MainHeader: () => null }));

jest.mock('@/frontend/hooks/chat', () => ({
  useMessages: () => ({
    isLoadingInitial: false,
    isLoadingOlder: false,
    loadOlder: jest.fn(),
    messages: [],
  }),
  useTopic: () => ({ data: { id: 'topic-1' }, isError: false, isLoading: false }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ debug: jest.fn() }) },
}));

jest.mock('../workspace', () => ({
  ChatWorkspace: (props: MockChatWorkspaceProps) => mockChatWorkspace(props),
}));

jest.mock('../NewTopicScreen', () => ({ NewTopicScreen: () => null }));

describe('ChatScreen preview', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPreview = false;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it.each([
    [false, 'normal navigation'],
    [true, 'a link preview'],
  ])('passes isPreview=%s during %s', async (isPreview) => {
    mockIsPreview = isPreview;

    await act(async () => {
      renderer = create(<ChatScreen />);
    });

    expect(mockChatWorkspace.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ isPreview, topicId: 'topic-1' }),
    );
  });
});
