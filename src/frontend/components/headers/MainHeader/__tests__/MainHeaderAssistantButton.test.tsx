import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';

import { MainHeaderAssistantButton, useMainHeaderAssistant } from '../MainHeaderAssistantButton';

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockAssistant: Assistant | undefined;
let mockAssistantId: string | undefined;
let mockTopicAssistantId: string | undefined;
let mockTopicId: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    assistantId: mockAssistantId,
    topicId: mockTopicId,
  }),
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantApiById: (assistantId: string | undefined) => ({
    assistant: assistantId === mockAssistant?.id ? mockAssistant : undefined,
  }),
  useTopic: () => ({
    data: mockTopicAssistantId ? { assistantId: mockTopicAssistantId } : undefined,
  }),
}));

jest.mock('../../components/HeaderAction/HeaderIconButton', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return { HeaderIconButton: MockPressable };
});

function Harness() {
  const { assistant, openAssistant } = useMainHeaderAssistant();

  return assistant ? (
    <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
  ) : null;
}

function NewTopicHarness() {
  const { openNewTopic } = useMainHeaderAssistant();

  return <Pressable onPress={openNewTopic} testID="new-topic-button" />;
}

function makeAssistant(): Assistant {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    description: '',
    emoji: '🌟',
    id: 'assistant-1',
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Peanut',
    orderKey: 'a1',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

describe('MainHeaderAssistantButton', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssistant = makeAssistant();
    mockAssistantId = undefined;
    mockTopicAssistantId = 'assistant-1';
    mockTopicId = 'topic-1';
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('opens the current assistant editor', async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    const button = renderer?.root.findByProps({ testID: 'current-assistant-button' });
    await act(async () => button?.props.onPress());

    expect(button?.props.accessibilityLabel).toBe('Peanut');
    expect(mockPush).toHaveBeenCalledWith({
      params: { assistantId: 'assistant-1' },
      pathname: '/assistants/[assistantId]/edit',
    });
  });

  it('uses the route assistant for a new chat without a return topic', async () => {
    mockAssistantId = 'assistant-1';
    mockTopicAssistantId = undefined;
    mockTopicId = undefined;

    await act(async () => {
      renderer = create(<Harness />);
    });

    const button = renderer?.root.findByProps({ testID: 'current-assistant-button' });
    await act(async () => button?.props.onPress());

    expect(mockPush).toHaveBeenCalledWith({
      params: { assistantId: 'assistant-1' },
      pathname: '/assistants/[assistantId]/edit',
    });
  });

  it('keeps the route assistant while the topic is still loading', async () => {
    // 发出新话题第一条消息时导航先于话题可读：`topicId` 已经在 URL 上、`useTopic` 还没
    // 返回。按钮此刻若消失，iOS 的 toolbar 会连着旁边那个按钮一起原生重建。
    mockAssistantId = 'assistant-1';
    mockTopicAssistantId = undefined;
    mockTopicId = 'topic-1';

    await act(async () => {
      renderer = create(<Harness />);
    });

    expect(
      renderer?.root.findByProps({ testID: 'current-assistant-button' }).props.accessibilityLabel,
    ).toBe('Peanut');
  });

  it('starts a new topic with the current topic assistant', async () => {
    await act(async () => {
      renderer = create(<NewTopicHarness />);
    });

    const button = renderer?.root.findByProps({ testID: 'new-topic-button' });
    await act(async () => button?.props.onPress());

    expect(mockSetParams).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      topicId: undefined,
    });
  });
});
