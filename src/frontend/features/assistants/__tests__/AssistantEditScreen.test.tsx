import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AssistantEditScreen from '../AssistantEditScreen';

const nameFieldLabel = 'assistant.form.name';

let mockAssistantId: string | undefined;
let mockAssistant: Assistant | undefined;
let mockIsLoading: boolean;
let mockDefaultModelPreference: string | null;
let mockHeaderActions: { onPress?: () => void }[];
let mockResolvableModelIds: string[];
let mockPickerSelectedModelIds: (UniqueModelId | null)[];
const mockCreateAssistant = jest.fn();
const mockRouterBack = jest.fn();
const mockToastShow = jest.fn();
const mockUpdateAssistant = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ assistantId: mockAssistantId }),
  useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: ({ rightActions = [] }: { rightActions?: { onPress?: () => void }[] }) => {
    mockHeaderActions = rightActions;
    return null;
  },
}));

jest.mock('heroui-native/text-area', () => {
  const { TextInput } = jest.requireActual('react-native');

  return { TextArea: TextInput };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native');

  return {
    Input: TextInput,
    Switch: (props: Record<string, unknown>) => React.createElement('MockSwitch', props),
  };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('lucide-uniwind/png', () => ({
  ChevronDownIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.mock('@/frontend/components/modelPicker', () => ({
  ModelPickerBottomSheet: ({ selectedModelId }: { selectedModelId: UniqueModelId | null }) => {
    mockPickerSelectedModelIds.push(selectedModelId);
    return null;
  },
  ModelPickerIcon: () => null,
  // The catalog resolves asynchronously, so an id only becomes a model once its provider
  // and model queries have landed.
  useModelPickerData: () => ({
    getModelItem: (modelId: string | null) =>
      modelId && mockResolvableModelIds.includes(modelId)
        ? { model: { name: modelId }, modelId, provider: { name: 'Provider One' } }
        : null,
  }),
}));

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockDefaultModelPreference, jest.fn()],
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantApiById: () => ({ assistant: mockAssistant, isLoading: mockIsLoading }),
  useAssistantMutations: () => ({
    createAssistant: mockCreateAssistant,
    isCreating: false,
    isUpdating: false,
    updateAssistant: mockUpdateAssistant,
  }),
}));

jest.mock('@/frontend/hooks/mcp/useMcpServers', () => ({
  useMcpServersApi: () => ({ servers: [] }),
}));

jest.mock('@/frontend/features/settings/components/SettingSelect', () => ({
  SettingSelect: () => null,
}));

jest.mock('../components/EmojiPickerBottomSheet', () => ({
  EmojiPickerBottomSheet: () => null,
}));

describe('AssistantEditScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function render() {
    act(() => {
      renderer = create(<AssistantEditScreen />);
    });
  }

  function rerender() {
    act(() => {
      renderer?.update(<AssistantEditScreen />);
    });
  }

  function nameField() {
    return renderer?.root.findAll((node) => node.props?.accessibilityLabel === nameFieldLabel);
  }

  function field(accessibilityLabel: string) {
    return (
      renderer?.root.findAll((node) => node.props?.accessibilityLabel === accessibilityLabel) ?? []
    );
  }

  function switchControl(accessibilityLabel: string) {
    if (!renderer) {
      throw new Error('Assistant edit screen was not rendered.');
    }

    return renderer.root.find(
      (node) => node.type === 'MockSwitch' && node.props.accessibilityLabel === accessibilityLabel,
    );
  }

  async function save() {
    const saveAction = mockHeaderActions.find((action) => action.onPress);
    if (!saveAction?.onPress) {
      throw new Error('Save action was not rendered.');
    }

    await act(async () => {
      saveAction.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function typeName(value: string) {
    act(() => {
      nameField()?.[0]?.props.onChangeText(value);
    });
  }

  beforeEach(() => {
    mockAssistantId = 'assistant-1';
    mockAssistant = undefined;
    mockIsLoading = true;
    mockDefaultModelPreference = null;
    mockHeaderActions = [];
    mockResolvableModelIds = [];
    mockPickerSelectedModelIds = [];
    mockCreateAssistant.mockReset();
    mockCreateAssistant.mockResolvedValue(undefined);
    mockRouterBack.mockReset();
    mockToastShow.mockReset();
    mockUpdateAssistant.mockReset();
    mockUpdateAssistant.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('does not mount the form while the record is loading', () => {
    render();

    expect(nameField()).toEqual([]);
  });

  it('seeds the fields from the record on the first pass', () => {
    mockAssistant = makeAssistant({ name: 'Peanut' });
    mockIsLoading = false;
    render();

    expect(nameField()?.[0]?.props.value).toBe('Peanut');
  });

  // The screen used to re-seed the form from the record whenever its identity changed,
  // which meant a background refetch silently discarded whatever the user had typed.
  it('keeps an in-progress edit when the record refetches', () => {
    mockAssistant = makeAssistant({ name: 'Peanut' });
    mockIsLoading = false;
    render();

    typeName('Renamed');
    mockAssistant = makeAssistant({ name: 'Peanut' });
    rerender();

    expect(nameField()?.[0]?.props.value).toBe('Renamed');
  });

  it('seeds a new assistant with the global default model once the catalog resolves', () => {
    mockAssistantId = undefined;
    mockIsLoading = false;
    mockDefaultModelPreference = 'provider-1:gpt-5';
    render();

    expect(mockPickerSelectedModelIds.at(-1)).toBeNull();

    mockResolvableModelIds = ['provider-1:gpt-5'];
    rerender();

    expect(mockPickerSelectedModelIds.at(-1)).toBe('provider-1:gpt-5');
  });

  it('never seeds a model over an existing assistant that has none', () => {
    mockAssistant = makeAssistant({ modelId: null });
    mockIsLoading = false;
    mockDefaultModelPreference = 'provider-1:gpt-5';
    mockResolvableModelIds = ['provider-1:gpt-5'];
    render();

    expect(mockPickerSelectedModelIds.at(-1)).toBeNull();
  });

  it('loads streaming and tool call controls from assistant settings', () => {
    mockAssistant = makeAssistant({
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        enableMaxToolCalls: true,
        maxToolCalls: 7,
        streamOutput: false,
      },
    });
    mockIsLoading = false;

    render();

    expect(switchControl('assistant.form.streamOutput').props.value).toBe(false);
    expect(switchControl('assistant.form.enableMaxToolCalls').props.value).toBe(true);
    expect(field('assistant.form.maxToolCalls')[0]?.props.value).toBe('7');
  });

  it('shows the max tool calls field only while its limit is enabled', () => {
    mockAssistant = makeAssistant({
      settings: {
        ...DEFAULT_ASSISTANT_SETTINGS,
        enableMaxToolCalls: false,
        maxToolCalls: 12,
      },
    });
    mockIsLoading = false;
    render();

    expect(field('assistant.form.maxToolCalls')).toEqual([]);

    act(() => {
      switchControl('assistant.form.enableMaxToolCalls').props.onValueChange(true);
    });

    expect(field('assistant.form.maxToolCalls')[0]?.props.value).toBe('12');
  });

  it('persists streaming and max tool call settings', async () => {
    mockAssistant = makeAssistant();
    mockIsLoading = false;
    render();

    act(() => {
      switchControl('assistant.form.streamOutput').props.onValueChange(false);
      field('assistant.form.maxToolCalls')[0]?.props.onChangeText('35');
    });
    await save();

    expect(mockUpdateAssistant).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({
        settings: expect.objectContaining({
          enableMaxToolCalls: true,
          maxToolCalls: 35,
          streamOutput: false,
        }),
      }),
    );
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive max tool call value', async () => {
    mockAssistant = makeAssistant();
    mockIsLoading = false;
    render();

    act(() => {
      field('assistant.form.maxToolCalls')[0]?.props.onChangeText('0');
    });
    await save();

    expect(mockUpdateAssistant).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'assistant.form.maxToolCallsInvalid',
      variant: 'danger',
    });
  });
});

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
