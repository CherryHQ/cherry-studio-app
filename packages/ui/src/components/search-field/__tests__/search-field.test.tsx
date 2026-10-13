import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SearchField } from '../search-field';

jest.mock('heroui-native/search-field', () => {
  const React = require('react');
  const { TextInput, View } = require('react-native');

  function Root(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-search-field' });
  }

  Root.Group = function SearchFieldGroup(props: object) {
    return React.createElement(View, { ...props, testID: 'group' });
  };
  Root.SearchIcon = function SearchFieldIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'icon' });
  };
  Root.Input = function SearchFieldInput(props: object) {
    return React.createElement(TextInput, { ...props, mockComponent: 'hero-search-input' });
  };
  Root.ClearButton = function SearchFieldClearButton(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-clear-button' });
  };

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

    expect(root.props.isDisabled).toBe(false);
    // Compare picked props: the input's ref holds a fiber tree that floods a failure diff.
    const {
      accessibilityLabel,
      autoCapitalize,
      autoCorrect,
      autoFocus,
      className,
      placeholder,
      returnKeyType,
    } = input.props;
    expect({
      accessibilityLabel,
      autoCapitalize,
      autoCorrect,
      autoFocus,
      className,
      placeholder,
      returnKeyType,
    }).toEqual({
      accessibilityLabel: 'Search providers',
      autoCapitalize: 'none',
      autoCorrect: false,
      autoFocus: false,
      className:
        'min-h-0 border-0 bg-transparent py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-0 android:shadow-none android:focus:border-0',
      placeholder: 'Search',
      returnKeyType: 'search',
    });
    // The group draws the capsule, so its whole surface is the field.
    expect(renderer!.root.findByProps({ testID: 'group' }).props.className).toBe(
      'min-h-10 rounded-full border border-border bg-field',
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

    const focus = jest.spyOn(input.props.ref.current, 'focus');
    const surface = renderer!.root.findAll(
      (node) => node.props.focusable === false && typeof node.props.onPress === 'function',
    )[0]!;
    act(() => surface.props.onPress());
    expect(focus).toHaveBeenCalledTimes(1);

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

  test('maps disabled state and owns the accessible clear action', () => {
    const onClear = jest.fn();

    act(() => {
      renderer = create(
        <SearchField
          accessibilityLabel="Search providers"
          clearAccessibilityLabel="Clear"
          disabled
          onChangeText={jest.fn()}
          onClear={onClear}
          value="Cherry"
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-search-field' });
    const clearButton = renderer!.root.findByProps({ mockComponent: 'hero-clear-button' });

    expect(root.props.isDisabled).toBe(true);
    expect(clearButton.props.accessibilityLabel).toBe('Clear');

    act(() => clearButton.props.onPress());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
