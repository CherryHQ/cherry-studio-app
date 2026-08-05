import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '../input';

jest.mock('heroui-native/utils', () => ({
  cn: (...classes: Array<false | null | string | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('heroui-native/input', () => {
  const React = require('react');
  const { TextInput } = require('react-native');

  return {
    Input: (props: object) =>
      React.createElement(TextInput, { ...props, mockComponent: 'hero-input' }),
  };
});

jest.mock('heroui-native/text-field', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    TextField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'hero-text-field' }),
  };
});

describe('Input', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled HeroUI text field with adaptive defaults', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <Input accessibilityLabel="Name" onChangeText={onChangeText} value="Cherry" />,
      );
    });

    const field = renderer!.root.findByProps({ mockComponent: 'hero-text-field' });
    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(field.props.isDisabled).toBe(false);
    expect(input.props.value).toBe('Cherry');
    expect(input.props.autoCapitalize).toBe('sentences');
    expect(input.props.autoCorrect).toBe(true);
    expect(input.props.className).toBe(
      'min-h-10 rounded-lg border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border',
    );
    expect(input.props.className).not.toContain('text-[16px]');

    act(() => input.props.onChangeText('Cherry Studio'));
    expect(onChangeText).toHaveBeenCalledWith('Cherry Studio');

    act(() => {
      renderer!.update(<Input accessibilityLabel="Name" onChangeText={onChangeText} value="" />);
    });
    expect(input.props.className).not.toContain('ios:pt-');
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

    const field = renderer!.root.findByProps({ mockComponent: 'hero-text-field' });
    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(field.props).toEqual(
      expect.objectContaining({
        isDisabled: true,
        testID: 'password-input-field',
      }),
    );
    expect(input.props).toEqual(
      expect.objectContaining({
        autoCapitalize: 'none',
        autoCorrect: false,
        autoFocus: true,
        keyboardType: 'email-address',
        maxLength: 40,
        placeholder: 'Password',
        returnKeyType: 'done',
        secureTextEntry: true,
        style,
        testID: 'password-input',
      }),
    );
  });

  test('supports a multiline input with consumer-defined minimum height', () => {
    const style = { minHeight: 96, textAlignVertical: 'top' as const };

    act(() => {
      renderer = create(
        <Input
          accessibilityLabel="Description"
          multiline
          onChangeText={jest.fn()}
          style={style}
          value={'First line\nSecond line'}
        />,
      );
    });

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props.multiline).toBe(true);
    expect(input.props.className).not.toContain('ios:pb-');
    expect(input.props.style).toBe(style);
  });
});
