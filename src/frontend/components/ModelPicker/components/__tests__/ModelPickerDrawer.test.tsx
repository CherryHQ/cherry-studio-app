import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ModelPickerGroup } from '../../utils/modelPickerData';
import type { ModelPickerListItem } from '../../utils/modelPickerListItems';
import { ModelPickerDrawer } from '../ModelPickerDrawer';

let mockGroups: ModelPickerGroup[] = [];
let mockListProps:
  | { emptyText?: string; isSearchFocused?: boolean; listItems: readonly ModelPickerListItem[] }
  | undefined;
let mockDismissKeyboardOnClose: boolean | undefined;

jest.mock('@/frontend/components/ModelRegistry', () => ({
  ModelRegistryGate: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { TextInput: MockTextInput, View: MockView } = jest.requireActual('react-native');

  return {
    BottomSheet: ({
      children,
      dismissKeyboardOnClose,
      size,
      testID,
    }: {
      children: ReactNode;
      dismissKeyboardOnClose?: boolean;
      size: string;
      testID: string;
    }) => {
      mockDismissKeyboardOnClose = dismissKeyboardOnClose;
      return (
        <MockView accessibilityValue={{ text: size }} testID={`${testID}-surface`}>
          {children}
        </MockView>
      );
    },
    SearchField: (props: Record<string, unknown>) => <MockTextInput {...props} />,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../hooks/useModelPickerData', () => ({
  useModelPickerData: () => ({ groups: mockGroups, isLoading: false }),
}));

jest.mock('../ModelPickerList', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModelPickerList: (props: { emptyText?: string; listItems: readonly ModelPickerListItem[] }) => {
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
    expect(mockDismissKeyboardOnClose).toBe(false);
    expect(mockListProps?.isSearchFocused).toBe(false);

    act(() => search().props.onFocus());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });
    expect(mockDismissKeyboardOnClose).toBe(true);
    expect(mockListProps?.isSearchFocused).toBe(true);

    act(() => search().props.onChangeText('qwen'));
    act(() => search().props.onBlur());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });
    expect(mockDismissKeyboardOnClose).toBe(false);
    expect(mockListProps?.isSearchFocused).toBe(false);

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
});
