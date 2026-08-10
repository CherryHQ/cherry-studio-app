import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AssistantDetailScreen from '../AssistantDetailScreen';

type HeaderAction = { key: string; label?: string; onPress?: () => void };

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
let mockAssistantId: string | undefined;
let mockAssistant: Assistant | undefined;
let mockError: Error | undefined;
let mockIsLoading = false;
let mockModelItem: { model: { name: string } } | null = null;
let mockOnBack: (() => void) | undefined;
let mockRedirectHref: string | undefined;
let mockReturnTopicId: string | undefined;
let mockRightActions: readonly HeaderAction[] = [];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({
    assistantId: mockAssistantId,
    returnTopicId: mockReturnTopicId,
  }),
  useRouter: () => ({ dismissTo: mockDismissTo, push: mockPush }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: ({
    onBack,
    rightActions,
  }: {
    onBack?: () => void;
    rightActions?: readonly HeaderAction[];
  }) => {
    mockOnBack = onBack;
    mockRightActions = rightActions ?? [];
    return null;
  },
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return { Button: MockPressable };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('@/frontend/components/modelPicker', () => ({
  ModelPickerIcon: () => null,
  useModelPickerData: () => ({ getModelItem: () => mockModelItem }),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantApiById: () => ({
    assistant: mockAssistant,
    error: mockError,
    isLoading: mockIsLoading,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'assistant.actions.startChat': 'Start chat',
        'assistant.form.loading': 'Loading assistant...',
        'assistant.form.prompt': 'Prompt',
        'assistant.model.none': 'No model selected',
        'common.edit': 'Edit',
      })[key] ?? key,
  }),
}));

function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    description: '',
    emoji: '🌟',
    groupId: null,
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
    ...overrides,
  };
}

describe('AssistantDetailScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  async function render() {
    await act(async () => {
      renderer = create(<AssistantDetailScreen />);
    });

    if (!renderer) {
      throw new Error('AssistantDetailScreen test renderer was not created.');
    }

    return renderer;
  }

  function renderedTexts(tree: ReactTestRenderer) {
    return tree.root.findAllByType(Text).map((item) => item.props.children);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssistantId = 'assistant-1';
    mockAssistant = undefined;
    mockError = undefined;
    mockIsLoading = false;
    mockModelItem = null;
    mockOnBack = undefined;
    mockRedirectHref = undefined;
    mockReturnTopicId = undefined;
    mockRightActions = [];
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the emoji, name and the currently picked model', async () => {
    mockAssistant = makeAssistant({ modelId: 'cherryai::gpt-5', modelName: 'GPT-5' });
    mockModelItem = { model: { name: 'GPT-5 Pro' } };

    const texts = renderedTexts(await render());

    expect(texts).toContain('🌟');
    expect(texts).toContain('Peanut');
    // The live catalog entry wins over the denormalized `modelName` snapshot.
    expect(texts).toContain('GPT-5 Pro');
  });

  it('scales the emoji with the global typography scale without a fixed line height', async () => {
    mockAssistant = makeAssistant();

    const tree = await render();
    const emoji = tree.root.findAllByType(Text).find((node) => node.props.children === '🌟');

    expect(emoji?.props.className).toContain('text-emoji-6xl');
    expect(emoji?.props.style).toBeUndefined();
    expect(emoji?.props.allowFontScaling).not.toBe(false);
  });

  it('falls back to the stored model name when the model left the catalog', async () => {
    mockAssistant = makeAssistant({ modelId: 'cherryai::retired', modelName: 'Retired Model' });

    const texts = renderedTexts(await render());

    expect(texts).toContain('Retired Model');
    expect(texts).not.toContain('No model selected');
  });

  it('shows the empty label when no model is selected', async () => {
    mockAssistant = makeAssistant();

    expect(renderedTexts(await render())).toContain('No model selected');
  });

  it('opens the editor from the header action', async () => {
    mockAssistant = makeAssistant();

    await render();
    const editAction = mockRightActions.find((action) => action.key === 'edit-assistant');
    editAction?.onPress?.();

    expect(editAction?.label).toBe('Edit');
    expect(mockPush).toHaveBeenCalledWith({
      params: { assistantId: 'assistant-1' },
      pathname: '/assistants/[assistantId]/edit',
    });
  });

  it('shows the prompt when the assistant has one', async () => {
    mockAssistant = makeAssistant({ prompt: 'You are a helpful reviewer.' });

    const texts = renderedTexts(await render());

    expect(texts).toContain('Prompt');
    expect(texts).toContain('You are a helpful reviewer.');
  });

  it('omits the prompt section when the prompt is blank', async () => {
    mockAssistant = makeAssistant({ prompt: '   ' });

    expect(renderedTexts(await render())).not.toContain('Prompt');
  });

  it('starts a chat bound to this assistant', async () => {
    mockAssistant = makeAssistant();

    const tree = await render();
    const [startChat] = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Start chat' && typeof node.props.onPress === 'function',
    );
    startChat.props.onPress();

    expect(mockPush).toHaveBeenCalledWith({
      params: { assistantId: 'assistant-1' },
      pathname: '/topics',
    });
  });

  it('returns directly to the originating chat when opened from a topic', async () => {
    mockAssistant = makeAssistant();
    mockReturnTopicId = 'topic-1';

    await render();
    mockOnBack?.();

    expect(mockDismissTo).toHaveBeenCalledWith({
      params: { topicId: 'topic-1' },
      pathname: '/topics',
    });
  });

  it('hides the start-chat action until the assistant has loaded', async () => {
    mockIsLoading = true;

    const tree = await render();

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Start chat' })).toHaveLength(0);
  });

  it('redirects back to the list when the assistant cannot be loaded', async () => {
    mockError = new Error('assistant not found');

    await render();

    expect(mockRedirectHref).toBe('/assistants');
  });

  it('redirects back to the list when the route has no assistant id', async () => {
    mockAssistantId = undefined;

    await render();

    expect(mockRedirectHref).toBe('/assistants');
  });
});
