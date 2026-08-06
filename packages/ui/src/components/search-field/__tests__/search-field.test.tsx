import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SearchField } from '../search-field';

jest.mock('heroui-native/search-field', () => {
  const React = require('react');
  const { TextInput, View } = require('react-native');

  function Root(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-search-field' });
  }

  Root.Group = (props: object) => React.createElement(View, { ...props, testID: 'group' });
  Root.SearchIcon = (props: object) => React.createElement(View, { ...props, testID: 'icon' });
  Root.Input = (props: object) =>
    React.createElement(TextInput, { ...props, mockComponent: 'hero-search-input' });
  Root.ClearButton = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'hero-clear-button' });

  return { SearchField: Root };
});

describe('SearchField', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders HeroUI search anatomy with search defaults', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <SearchField
          accessibilityLabel="Search providers"
          clearAccessibilityLabel="Clear"
          onChangeText={onChangeText}
          placeholder="Search"
          value="Cherry"
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-search-field' });
    const input = renderer!.root.findByProps({ mockComponent: 'hero-search-input' });

    expect(root.props.value).toBe('Cherry');
    expect(root.props.isDisabled).toBe(false);
    expect(input.props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'Search providers',
        autoCapitalize: 'none',
        autoCorrect: false,
        autoFocus: false,
        className:
          'min-h-10 rounded-full border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border',
        placeholder: 'Search',
        returnKeyType: 'search',
      }),
    );
    expect(input.props.className).not.toContain('text-[16px]');
    expect(input.props.style).toEqual({
      includeFontPadding: false,
      textAlignVertical: 'center',
      verticalAlign: 'middle',
    });
    expect(renderer!.root.findByProps({ testID: 'icon' })).toBeDefined();

    act(() => root.props.onChange('Studio'));
    expect(onChangeText).toHaveBeenCalledWith('Studio');

    act(() => {
      renderer!.update(
        <SearchField
          accessibilityLabel="Search providers"
          clearAccessibilityLabel="Clear"
          onChangeText={onChangeText}
          placeholder="Search"
          value=""
        />,
      );
    });
    expect(input.props.className).not.toContain('ios:pt-');
  });

  test('forwards state, callbacks, layout, and test IDs', () => {
    const onBlur = jest.fn();
    const onClear = jest.fn();
    const onFocus = jest.fn();
    const onSubmitEditing = jest.fn();
    const style = { marginTop: 8 };

    act(() => {
      renderer = create(
        <SearchField
          accessibilityLabel="Search providers"
          autoFocus
          clearAccessibilityLabel="Clear"
          disabled
          onBlur={onBlur}
          onChangeText={jest.fn()}
          onClear={onClear}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          style={style}
          testID="provider-search"
          value="Cherry"
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-search-field' });
    const input = renderer!.root.findByProps({ mockComponent: 'hero-search-input' });
    const clearButton = renderer!.root.findByProps({ mockComponent: 'hero-clear-button' });

    expect(root.props).toEqual(
      expect.objectContaining({
        isDisabled: true,
        style,
        testID: 'provider-search-root',
      }),
    );
    expect(input.props).toEqual(
      expect.objectContaining({
        autoFocus: true,
        onBlur,
        onFocus,
        onSubmitEditing,
        testID: 'provider-search',
      }),
    );
    expect(clearButton.props.accessibilityLabel).toBe('Clear');
    expect(clearButton.props.testID).toBe('provider-search-clear');

    act(() => clearButton.props.onPress());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
