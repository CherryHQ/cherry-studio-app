import { TextInput, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { InlineSearch } from '../InlineSearch.android';

jest.mock('@cherrystudio/ui/components', () => {
  const { TextInput: MockTextInput } = jest.requireActual('react-native');

  return {
    SearchField: (props: Record<string, unknown>) => <MockTextInput {...props} />,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('InlineSearch.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('binds the controlled value and keeps the screen frame by default', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(<InlineSearch onChangeText={onChangeText} value="abc" />);
    });

    expect(renderer!.root.findByType(View).props.className).toBe('px-4 pb-2');
    expect(renderer!.root.findByType(TextInput).props.value).toBe('abc');

    act(() => renderer!.root.findByType(TextInput).props.onChangeText('typed'));
    expect(onChangeText).toHaveBeenLastCalledWith('typed');
  });

  it('drops the screen frame when embedded', () => {
    act(() => {
      renderer = create(<InlineSearch layout="embedded" onChangeText={jest.fn()} value="" />);
    });

    expect(renderer!.root.findByType(View).props.className).toBeUndefined();
    expect(renderer!.root.findByType(TextInput).props.value).toBe('');
  });
});
