import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import AssistantDetailScreen from '../AssistantDetailScreen';

type HeaderAction = { key: string; label?: string; onPress?: () => void };

const mockPush = jest.fn();
let mockAssistantId: string | undefined;
let mockAssistant: Assistant | undefined;
let mockError: Error | undefined;
let mockIsLoading = false;
let mockModelItem: { model: { name: string } } | null = null;
let mockRedirectHref: string | undefined;
let mockRightActions: readonly HeaderAction[] = [];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({ assistantId: mockAssistantId }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/headers', () => ({
  BackHeader: ({ rightActions }: { rightActions?: readonly HeaderAction[] }) => {
    mockRightActions = rightActions ?? [];
    return null;
  },
}));

jest.mock('@/components/modelPicker', () => ({
  ModelPickerIcon: () => null,
  useModelPickerData: () => ({ getModelItem: () => mockModelItem }),
}));

jest.mock('@/hooks/chat', () => ({
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
        'assistant.form.loading': 'Loading assistant...',
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
    mockRedirectHref = undefined;
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
