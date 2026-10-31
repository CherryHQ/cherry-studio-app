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
      listItems: readonly ModelPickerListItem[];
      maxSelectedCount?: number;
      selectedModelIds?: readonly string[];
    }
  | undefined;
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
      size,
      testID,
      title,
    }: {
      children: ReactNode;
      footer?: ReactNode;
      headerAction?: ReactNode;
      size: string;
      testID: string;
      title: string;
    }) => {
      // Like the real portal, the sheet's content sits outside the screen's PolicyScope.
      const { PolicyScope: MockPolicyScope } = jest.requireActual(
        '@/frontend/components/Policy/PolicyScope',
      );
      const { OPEN_POLICY } = jest.requireActual('@/shared/data/managedPolicy');
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
    SearchField: (props: Record<string, unknown>) => <MockTextInput {...props} />,
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

  test('expands while searching and collapses only after an empty search loses focus', () => {
    const sheet = () => renderer.root.findByProps({ testID: 'model-picker-surface' });
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search' });

    expect(sheet().props.accessibilityValue).toEqual({ text: 'large' });

    act(() => search().props.onFocus());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onChangeText('qwen'));
    act(() => search().props.onBlur());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onClear());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'large' });
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
