import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { InlineSearch } from '../InlineSearch.ios';

const mockSetText = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  const SearchBar = React.forwardRef(function MockSearchBar(
    props: Record<string, unknown>,
    ref: unknown,
  ) {
    React.useImperativeHandle(ref, () => ({ setText: mockSetText }));
    return React.createElement(View, { ...props, testID: 'search-bar' });
  });

  return { Stack: { SearchBar } };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('InlineSearch.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('applies an initial non-empty value and later controlled updates', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(<InlineSearch onChangeText={onChangeText} value="abc" />);
    });
    expect(mockSetText).toHaveBeenLastCalledWith('abc');

    act(() => {
      renderer?.update(<InlineSearch onChangeText={onChangeText} value="" />);
    });
    expect(mockSetText).toHaveBeenLastCalledWith('');

    act(() => {
      renderer?.update(<InlineSearch onChangeText={onChangeText} value="abc" />);
    });
    expect(mockSetText).toHaveBeenLastCalledWith('abc');
    expect(mockSetText).toHaveBeenCalledTimes(3);
  });

  it('reports native edits without sending the same value back as a command', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(<InlineSearch onChangeText={onChangeText} value="abc" />);
    });
    mockSetText.mockClear();

    const searchBar = renderer!.root.findByProps({ testID: 'search-bar' });
    act(() => searchBar.props.onChangeText({ nativeEvent: { text: 'typed' } }));
    expect(onChangeText).toHaveBeenLastCalledWith('typed');

    act(() => {
      renderer?.update(<InlineSearch onChangeText={onChangeText} value="typed" />);
    });
    expect(mockSetText).not.toHaveBeenCalled();

    act(() => searchBar.props.onCancelButtonPress());
    expect(onChangeText).toHaveBeenLastCalledWith('');
    act(() => {
      renderer?.update(<InlineSearch onChangeText={onChangeText} value="" />);
    });
    expect(mockSetText).not.toHaveBeenCalled();
  });
});
