import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SearchField } from '../search-field.ios';

type MockNativeText = {
  get: jest.Mock<string, []>;
  set: jest.Mock<void, [string]>;
  value: string;
};

const mockNativeText: MockNativeText = {
  get: jest.fn((): string => mockNativeText.value),
  set: jest.fn((value: string) => {
    mockNativeText.value = value;
  }),
  value: '',
};
let mockNativeStateInitialized = false;

jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Button: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-button' }),
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    HStack: (props: object) => React.createElement(View, { ...props, mockComponent: 'h-stack' }),
    Image: (props: object) => React.createElement(View, { ...props, mockComponent: 'image' }),
    TextField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-text-field' }),
    useNativeState: (value: string) => {
      if (!mockNativeStateInitialized) {
        mockNativeText.value = value;
        mockNativeStateInitialized = true;
      }

      return mockNativeText;
    },
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityHidden: () => ({ accessibilityHidden: true }),
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  autocorrectionDisabled: () => ({ autocorrectionDisabled: true }),
  background: (color: unknown, shape: unknown) => ({ background: { color, shape } }),
  buttonStyle: (style: string) => ({ buttonStyle: style }),
  disabled: (disabled: boolean) => ({ disabled }),
  font: (params: unknown) => ({ font: params }),
  foregroundStyle: (style: unknown) => ({ foregroundStyle: style }),
  frame: (params: unknown) => ({ frame: params }),
  labelStyle: (style: string) => ({ labelStyle: style }),
  onSubmit: (handler: () => void) => ({ onSubmit: handler }),
  padding: (params: unknown) => ({ padding: params }),
  shapes: {
    roundedRectangle: (params: unknown) => ({ roundedRectangle: params }),
  },
  submitLabel: (label: string) => ({ submitLabel: label }),
  textFieldStyle: (style: string) => ({ textFieldStyle: style }),
  textInputAutocapitalization: (value: string) => ({ textInputAutocapitalization: value }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('SearchField (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockNativeStateInitialized = false;
    mockNativeText.value = '';
    mockNativeText.get.mockClear();
    mockNativeText.set.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders native search content with adaptive layout and search defaults', () => {
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

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const stack = renderer!.root.findByProps({ mockComponent: 'h-stack' });
    const icon = renderer!.root.findByProps({ mockComponent: 'image' });
    const input = renderer!.root.findByProps({ mockComponent: 'expo-text-field' });

    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.matchContents).toEqual({ vertical: true });
    expect(host.props.style).toEqual([{ alignSelf: 'stretch' }, undefined]);
    expect(stack.props.modifiers).toEqual(
      expect.arrayContaining([
        { frame: { alignment: 'leading', maxWidth: Infinity } },
        { padding: { horizontal: 10, vertical: 8 } },
        { disabled: false },
      ]),
    );
    expect(icon.props.systemName).toBe('magnifyingglass');
    expect(input.props.text).toBe(mockNativeText);
    expect(input.props.modifiers).toEqual(
      expect.arrayContaining([
        { accessibilityLabel: 'Search providers' },
        { autocorrectionDisabled: true },
        { submitLabel: 'search' },
        { textFieldStyle: 'plain' },
        { textInputAutocapitalization: 'never' },
      ]),
    );

    act(() => input.props.onTextChange('Studio'));
    expect(onChangeText).toHaveBeenCalledWith('Studio');
  });

  test('clears native and controlled values and forwards interaction callbacks', () => {
    const onBlur = jest.fn();
    const onChangeText = jest.fn();
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
          onChangeText={onChangeText}
          onClear={onClear}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          style={style}
          testID="provider-search"
          value="Cherry"
        />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const input = renderer!.root.findByProps({ mockComponent: 'expo-text-field' });
    const clearButton = renderer!.root.findByProps({ mockComponent: 'expo-button' });

    expect(host.props.style).toEqual([{ alignSelf: 'stretch' }, style]);
    expect(host.props.testID).toBe('provider-search-host');
    expect(input.props.autoFocus).toBe(true);
    expect(clearButton.props).toEqual(
      expect.objectContaining({
        label: 'Clear',
        systemImage: 'xmark.circle.fill',
        testID: 'provider-search-clear',
      }),
    );

    act(() => input.props.onFocusChange(true));
    expect(onFocus).toHaveBeenCalledTimes(1);
    act(() => input.props.onFocusChange(false));
    expect(onBlur).toHaveBeenCalledTimes(1);

    const submitModifier = input.props.modifiers.find(
      (modifier: { onSubmit?: () => void }) => modifier.onSubmit,
    );
    act(() => submitModifier.onSubmit());
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);

    act(() => clearButton.props.onPress());
    expect(mockNativeText.set).toHaveBeenCalledWith('');
    expect(onChangeText).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('hides the clear action when the value is empty', () => {
    act(() => {
      renderer = create(
        <SearchField
          accessibilityLabel="Search providers"
          clearAccessibilityLabel="Clear"
          onChangeText={jest.fn()}
          value=""
        />,
      );
    });

    expect(renderer!.root.findAllByProps({ mockComponent: 'expo-button' })).toHaveLength(0);
  });
});
