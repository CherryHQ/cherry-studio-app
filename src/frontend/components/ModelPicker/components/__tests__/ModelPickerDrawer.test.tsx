import type { BottomSheetSize } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PolicyScope } from '@/frontend/components/Policy';
import { agentPolicy } from '@/shared/data/managedPolicy';

import type { ModelPickerGroup } from '../../utils/modelPickerData';
import type { ModelPickerListItem } from '../../utils/modelPickerListItems';
import { ModelPickerDrawer } from '../ModelPickerDrawer';

let mockGroups: ModelPickerGroup[] = [];
let mockListProps:
  | {
      emptyText?: string;
      emptyAction?: { label: string; onPress: () => void };
      listItems: readonly ModelPickerListItem[];
      maxSelectedCount?: number;
      selectedModelIds?: readonly string[];
    }
  | undefined;
let mockOnSizeChange: ((size: BottomSheetSize) => void) | undefined;
let mockFilterItems: { id: string; onPress: () => void }[] = [];
const chosenModelId = 'provider::chosen';

jest.mock('@/frontend/components/ModelRegistry', () => ({
  ModelRegistryGate: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const {
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  Button.Label = function ButtonLabel({ children }: { children: ReactNode }) {
    return <MockText>{children}</MockText>;
  };

  return {
    BottomSheet: ({
      children,
      footer,
      headerAction,
      onSizeChange,
      size,
      testID,
      title,
    }: {
      children: ReactNode;
      footer?: ReactNode;
      headerAction?: ReactNode;
      onSizeChange?: (size: BottomSheetSize) => void;
      size: string;
      testID: string;
      title: string;
    }) => {
      // Like the real portal, the sheet's content sits outside the screen's PolicyScope.
      const { PolicyScope: MockPolicyScope } = jest.requireActual(
        '@/frontend/components/Policy/PolicyScope',
      );
      const { OPEN_POLICY } = jest.requireActual('@/shared/data/managedPolicy');
      mockOnSizeChange = onSizeChange;
      return (
        <MockView
          accessibilityLabel={title}
          accessibilityValue={{ text: size }}
          testID={`${testID}-surface`}
        >
          {headerAction}
          <MockPolicyScope policy={OPEN_POLICY}>{children}</MockPolicyScope>
          {footer}
        </MockView>
      );
    },
    Button,
    SearchField: (props: Record<string, unknown>) => (
      <MockTextInput onBlur={jest.fn()} {...props} testID={`${props.testID}-input`} />
    ),
    ActionMenu: ({ children, items }: { children: ReactNode; items: typeof mockFilterItems }) => {
      mockFilterItems = items;
      return <MockView>{children}</MockView>;
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../hooks/useModelPickerData', () => ({
  useModelPickerData: () => ({
    groups: mockGroups,
    isLoading: false,
  }),
}));

jest.mock('../ModelPickerList', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModelPickerList: (props: NonNullable<typeof mockListProps>) => {
      mockListProps = props;
      return <MockView />;
    },
  };
});

describe('ModelPickerDrawer', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    mockGroups = [];
    mockListProps = undefined;
    mockOnSizeChange = undefined;
    mockFilterItems = [];
    act(() => {
      renderer = create(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('retains full height after blur and clearing, and preserves search on manual collapse', () => {
    const sheet = () => renderer.root.findByProps({ testID: 'model-picker-surface' });
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search-input' });

    expect(sheet().props.accessibilityValue).toEqual({ text: 'large' });

    act(() => search().props.onFocus());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onChangeText('qwen'));
    act(() => search().props.onBlur());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onClear());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onChangeText('qwen'));
    act(() => mockOnSizeChange?.('large'));
    expect(sheet().props.accessibilityValue).toEqual({ text: 'large' });
    expect(search().props.value).toBe('qwen');
  });

  test('distinguishes filtered emptiness and clears both the query and capability condition', () => {
    mockGroups = [
      {
        items: [
          {
            key: 'text-model',
            modelId: 'provider::text-model',
            model: {
              capabilities: [],
              modelId: 'text-model',
              name: 'Text model',
              providerId: 'provider',
            },
          } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];
    act(() => {
      renderer.update(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
          variant="chat"
        />,
      );
    });
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search-input' });
    act(() => search().props.onChangeText('missing'));
    act(() => mockFilterItems.find((item) => item.id === 'vision')?.onPress());

    expect(mockListProps?.listItems).toHaveLength(0);
    expect(mockListProps?.emptyText).toBe('settings.provider.models.search.empty');
    expect(mockListProps?.emptyAction?.label).toBe('modelPicker.clearConditions');

    act(() => mockListProps?.emptyAction?.onPress());

    expect(search().props.value).toBe('');
    expect(mockListProps?.listItems.filter((item) => item.type === 'model')).toHaveLength(1);
    expect(
      renderer.root.findByProps({ testID: 'model-picker-filter' }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  test('keeps only caller-compatible models and uses the caller empty copy', () => {
    act(() => renderer.unmount());
    mockGroups = [
      {
        items: [
          { key: 'compatible', modelId: 'provider::compatible' } as never,
          { key: 'incompatible', modelId: 'provider::incompatible' } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];

    act(() => {
      renderer = create(
        <ModelPickerDrawer
          emptyText="No compatible models"
          isModelVisible={(item) => item.modelId === 'provider::compatible'}
          modelType="image"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
        />,
      );
    });

    expect(
      mockListProps?.listItems
        .filter((item) => item.type === 'model')
        .map((item) => item.item.modelId),
    ).toEqual(['provider::compatible']);
    expect(mockListProps?.emptyText).toBe('No compatible models');
  });

  test('offers only the models of an enclosing scope', () => {
    act(() => renderer.unmount());
    mockGroups = [
      {
        items: [
          { key: 'pooled', modelId: 'provider::pooled' } as never,
          { key: 'other', modelId: 'provider::other' } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];

    act(() => {
      renderer = create(
        <PolicyScope
          policy={agentPolicy({
            isManaged: true,
            allowedModelIds: ['provider::pooled', 'provider::elsewhere'],
          })}
        >
          <ModelPickerDrawer
            modelType="text"
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
          />
        </PolicyScope>,
      );
    });

    expect(
      mockListProps?.listItems
        .filter((item) => item.type === 'model')
        .map((item) => item.item.modelId),
    ).toEqual(['provider::pooled']);
  });

  test('offers a multi-select mode entered and left from the header', () => {
    const multiSelect = {
      enabled: false,
      maxCount: 8,
      onEnabledChange: jest.fn(),
      selectedModelIds: [chosenModelId],
    };
    const render = (enabled: boolean) =>
      act(() => {
        renderer.update(
          <ModelPickerDrawer
            modelType="text"
            multiSelect={{ ...multiSelect, enabled }}
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
          />,
        );
      });
    const sheet = () => renderer.root.findByProps({ testID: 'model-picker-surface' });
    const toggle = () => renderer.root.findByProps({ testID: 'model-picker-multi-select' });

    render(false);
    expect(sheet().props.accessibilityLabel).toBe('modelPicker.title');
    expect(mockListProps?.selectedModelIds).toBeUndefined();
    act(() => toggle().props.onPress());
    expect(multiSelect.onEnabledChange).toHaveBeenLastCalledWith(true);

    render(true);
    expect(sheet().props.accessibilityLabel).toBe('modelPicker.multiSelect.title');
    expect(mockListProps).toMatchObject({ maxSelectedCount: 8, selectedModelIds: [chosenModelId] });
    act(() => toggle().props.onPress());
    expect(multiSelect.onEnabledChange).toHaveBeenLastCalledWith(false);
  });
});
