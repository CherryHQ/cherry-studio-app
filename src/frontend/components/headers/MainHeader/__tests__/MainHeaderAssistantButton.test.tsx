import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/domain/assistant';

import { MainHeaderAssistantButton, useMainHeaderAssistant } from '../MainHeaderAssistantButton';

const mockPush = jest.fn();
let mockAssistant: Assistant | undefined;
let mockAssistantId: string | undefined;
let mockTopicAssistantId: string | undefined;
let mockTopicId: string | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    assistantId: mockAssistantId,
    topicId: mockTopicId,
  }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantApiById: (assistantId: string | undefined) => ({
    assistant: assistantId === mockAssistant?.id ? mockAssistant : undefined,
  }),
  useTopic: () => ({
    data: mockTopicAssistantId ? { assistantId: mockTopicAssistantId } : undefined,
  }),
}));

function Harness() {
  const { assistant, openAssistant } = useMainHeaderAssistant();

  return assistant ? (
    <MainHeaderAssistantButton assistant={assistant} onPress={openAssistant} />
  ) : null;
}

function makeAssistant(): Assistant {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    description: '',
    emoji: '🌟',
    id: 'assistant-1',
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId: null,
    modelName: null,
    name: 'Peanut',
    orderKey: 'a1',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    tags: [],
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

  it('opens the current assistant and carries the originating topic', async () => {
    await act(async () => {
      renderer = create(<Harness />);
    });

    const button = renderer?.root.findByProps({ testID: 'current-assistant-button' });
    await act(async () => button?.props.onPress());

    expect(button?.props.accessibilityLabel).toBe('Peanut');
    expect(mockPush).toHaveBeenCalledWith({
      params: {
        assistantId: 'assistant-1',
        returnTopicId: 'topic-1',
      },
      pathname: '/assistants/[assistantId]',
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
      pathname: '/assistants/[assistantId]',
    });
  });
});
