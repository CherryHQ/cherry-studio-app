import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '../input.ios';

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
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    SecureField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-secure-field' }),
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
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  autocorrectionDisabled: (disabled: boolean) => ({ autocorrectionDisabled: disabled }),
  disabled: (disabled: boolean) => ({ disabled }),
  keyboardType: (type: string) => ({ keyboardType: type }),
  onSubmit: (handler: () => void) => ({ onSubmit: handler }),
  submitLabel: (label: string) => ({ submitLabel: label }),
  textFieldStyle: (style: string) => ({ textFieldStyle: style }),
  textInputAutocapitalization: (value: string) => ({ textInputAutocapitalization: value }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('Input (iOS)', () => {
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

  test('renders a controlled Expo UI text field with native default styling', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <Input accessibilityLabel="Name" onChangeText={onChangeText} value="Cherry" />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const input = renderer!.root.findByProps({ mockComponent: 'expo-text-field' });

    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.matchContents).toEqual({ vertical: true });
    expect(host.props.style).toEqual([{ alignSelf: 'stretch' }, undefined]);
    expect(input.props.text).toBe(mockNativeText);
    expect(input.props.modifiers).toEqual([
      { textFieldStyle: 'roundedBorder' },
      { accessibilityLabel: 'Name' },
      { disabled: false },
      { autocorrectionDisabled: false },
      { textInputAutocapitalization: 'sentences' },
    ]);

    act(() => input.props.onTextChange('Cherry Studio'));
    expect(onChangeText).toHaveBeenCalledWith('Cherry Studio');
  });

  test('maps secure, keyboard, focus, submit, disabled, and layout props', () => {
    const onBlur = jest.fn();
    const onFocus = jest.fn();
    const onSubmitEditing = jest.fn();
    const style = { marginTop: 8 };

    act(() => {
      renderer = create(
        <Input
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          disabled
          keyboardType="email-address"
          maxLength={40}
          onBlur={onBlur}
          onChangeText={jest.fn()}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          placeholder="Password"
          returnKeyType="done"
          secureTextEntry
          style={style}
          testID="password-input"
          value="secret"
        />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const input = renderer!.root.findByProps({ mockComponent: 'expo-secure-field' });

    expect(host.props.style).toEqual([{ alignSelf: 'stretch' }, style]);
    expect(host.props.testID).toBe('password-input-host');
    expect(input.props).toEqual(
      expect.objectContaining({
        autoFocus: true,
        maxLength: 40,
        placeholder: 'Password',
        testID: 'password-input',
      }),
    );
    expect(input.props.modifiers).toEqual(
      expect.arrayContaining([
        { autocorrectionDisabled: true },
        { disabled: true },
        { keyboardType: 'email-address' },
        { submitLabel: 'done' },
        { textInputAutocapitalization: 'never' },
      ]),
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
  });

  test('synchronizes an external value change into native state', () => {
    act(() => {
      renderer = create(
        <Input accessibilityLabel="Name" onChangeText={jest.fn()} value="Before" />,
      );
    });

    mockNativeText.value = 'Before';
    mockNativeText.set.mockClear();
    act(() => {
      renderer!.update(<Input accessibilityLabel="Name" onChangeText={jest.fn()} value="After" />);
    });

    expect(mockNativeText.set).toHaveBeenCalledWith('After');
  });
});
