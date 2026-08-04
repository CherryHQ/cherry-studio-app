import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '../input.android';

jest.mock('heroui-native/input', () => {
  const React = require('react');
  const { TextInput } = require('react-native');

  return {
    Input: (props: object) =>
      React.createElement(TextInput, { ...props, mockComponent: 'hero-input' }),
  };
});

describe('Input (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled HeroUI input with adaptive defaults', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <Input accessibilityLabel="Name" onChangeText={onChangeText} value="Cherry" />,
      );
    });

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props.value).toBe('Cherry');
    expect(input.props.autoCapitalize).toBe('sentences');
    expect(input.props.autoCorrect).toBe(true);
    expect(input.props.isDisabled).toBe(false);
    expect(input.props.style).toBeUndefined();

    act(() => input.props.onChangeText('Cherry Studio'));
    expect(onChangeText).toHaveBeenCalledWith('Cherry Studio');
  });

  test('forwards supported input behavior without adding a fixed size', () => {
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

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props).toEqual(
      expect.objectContaining({
        autoCapitalize: 'none',
        autoCorrect: false,
        autoFocus: true,
        isDisabled: true,
        keyboardType: 'email-address',
        maxLength: 40,
        placeholder: 'Password',
        returnKeyType: 'done',
        secureTextEntry: true,
        style,
        testID: 'password-input',
      }),
    );
    expect(input.props.className).toBeUndefined();
  });
});
