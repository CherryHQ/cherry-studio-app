import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '../input';

jest.mock('heroui-native/utils', () => ({
  cn: (...classes: Array<false | null | string | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: () => 24,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ fontScale: 1, height: 800, scale: 2, width: 400 }),
}));

jest.mock('heroui-native/input', () => {
  const React = require('react');
  const { TextInput } = require('react-native');

  return {
    Input: (props: object) =>
      React.createElement(TextInput, { ...props, mockComponent: 'hero-input' }),
  };
});

describe('Input', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a HeroUI text field with adaptive defaults', () => {
    act(() => {
      renderer = create(
        <Input accessibilityLabel="Name" onChangeText={jest.fn()} value="Cherry" />,
      );
    });

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props.isDisabled).toBeUndefined();
    expect(input.props.isInvalid).toBeUndefined();
    expect(input.props.autoCapitalize).toBe('sentences');
    expect(input.props.autoCorrect).toBe(true);
    expect(input.props.className).toBe(
      'min-h-10 rounded-lg border border-border py-0 text-(length:--text-base) shadow-none ios:shadow-none ios:focus:outline-transparent android:border-border android:shadow-none android:focus:border-border',
    );
    expect(input.props.className).not.toContain('text-[16px]');

    act(() => {
      renderer!.update(<Input accessibilityLabel="Name" onChangeText={jest.fn()} value="" />);
    });
    expect(input.props.className).not.toContain('ios:pt-');
  });

  test('maps shared validation state to HeroUI', () => {
    act(() => {
      renderer = create(
        <Input
          accessibilityLabel="Password"
          disabled
          invalid
          onChangeText={jest.fn()}
          value="secret"
        />,
      );
    });

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props.isDisabled).toBe(true);
    expect(input.props.isInvalid).toBe(true);
  });

  test('uses a four-line adaptive viewport for multiline input', () => {
    act(() => {
      renderer = create(
        <Input
          accessibilityLabel="Description"
          multiline
          onChangeText={jest.fn()}
          value={'First line\nSecond line'}
        />,
      );
    });

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });

    expect(input.props.multiline).toBe(true);
    expect(input.props.scrollEnabled).toBe(true);
    expect(input.props.className).toContain('py-2');
    expect(input.props.className).toContain('min-h-10');
    expect(input.props.className).toContain('text-base');
    expect(input.props.style).toEqual([{ height: 112 }, undefined]);
  });
});
