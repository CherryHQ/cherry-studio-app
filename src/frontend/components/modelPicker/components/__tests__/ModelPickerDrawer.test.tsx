import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ModelPickerDrawer } from '../ModelPickerDrawer';

jest.mock('@cherrystudio/ui/components', () => {
  const { TextInput: MockTextInput, View: MockView } = jest.requireActual('react-native');

  return {
    BottomSheet: ({
      children,
      size,
      testID,
    }: {
      children: ReactNode;
      size: string;
      testID: string;
    }) => (
      <MockView accessibilityValue={{ text: size }} testID={`${testID}-surface`}>
        {children}
      </MockView>
    ),
    SearchField: (props: Record<string, unknown>) => <MockTextInput {...props} />,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../hooks/useModelPickerData', () => ({
  useModelPickerData: () => ({ groups: [], isLoading: false }),
}));

jest.mock('../ModelPickerList', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { ModelPickerList: () => <MockView /> };
});

describe('ModelPickerDrawer', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
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
});
