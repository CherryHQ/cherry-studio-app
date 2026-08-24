import { createRef, type ReactElement } from 'react';
import { type TextInput, type TextInputProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Input } from '../input';

const mockNativeInputNode = { blur: jest.fn() };

jest.mock('@cherrystudio/app-icons/icons/eye', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/eye-off', () => () => null);

jest.mock('heroui-native/hooks', () => ({
  useIsOnSurface: () => false,
}));

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

  return {
    Input: React.forwardRef(function HeroInput(props: object, ref: React.ForwardedRef<unknown>) {
      React.useImperativeHandle(ref, () => mockNativeInputNode, []);
      return React.createElement('hero-input', { ...props, mockComponent: 'hero-input' });
    }),
  };
});

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');

  return {
    default: {
      View: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('animated-view', undefined, children),
    },
    Easing: { bezier: jest.fn(), linear: jest.fn() },
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ get: () => value, set: jest.fn() }),
    withTiming: (value: number) => value,
  };
});

jest.mock('../../button', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');

  return {
    Button: (props: object) => React.createElement('button', props),
  };
});

jest.mock('../../text-field', () => ({
  useTextField: () => undefined,
}));

describe('Input', () => {
  let renderer: ReactTestRenderer | undefined;

  function renderInput(element: ReactElement) {
    act(() => {
      renderer = create(element);
    });
  }

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockNativeInputNode.blur.mockClear();
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

  test('starts a password hidden and toggles its visibility action', () => {
    renderInput(
      <Input
        accessibilityLabel="API key"
        onChangeText={jest.fn()}
        type="password"
        value="secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });
    const button = renderer!.root.findByType('button');

    expect(input.props.secureTextEntry).toBe(true);
    expect(button.props.accessibilityLabel).toBe('Show API key');

    act(() => button.props.onPress());

    expect(input.props.secureTextEntry).toBe(false);
    expect(button.props.accessibilityLabel).toBe('Hide API key');
  });

  test('shows the start while a password is blurred and releases selection while focused', () => {
    const onBlur = jest.fn();
    const onFocus = jest.fn();
    const blurEvent = { nativeEvent: { target: 1 } } as Parameters<
      NonNullable<TextInputProps['onBlur']>
    >[0];
    const focusEvent = { nativeEvent: { target: 1 } } as Parameters<
      NonNullable<TextInputProps['onFocus']>
    >[0];

    renderInput(
      <Input
        accessibilityLabel="API key"
        onBlur={onBlur}
        onChangeText={jest.fn()}
        onFocus={onFocus}
        selectTextOnFocus
        type="password"
        value="a-very-long-secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    const input = renderer!.root.findByProps({ mockComponent: 'hero-input' });
    expect(input.props.selection).toEqual({ end: 0, start: 0 });

    act(() => input.props.onFocus(focusEvent));

    expect(onFocus).toHaveBeenCalledWith(focusEvent);
    expect(input.props.selection).toBeUndefined();

    act(() => input.props.onBlur(blurEvent));

    expect(onBlur).toHaveBeenCalledWith(blurEvent);
    expect(input.props.selection).toEqual({ end: 0, start: 0 });
  });

  test('clips password text before the trailing visibility action', () => {
    renderInput(
      <Input
        accessibilityLabel="API key"
        onChangeText={jest.fn()}
        type="password"
        value="a-very-long-secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    const inputClip = renderer!.root.findByProps({
      className: 'min-w-0 flex-1 overflow-hidden',
    });

    expect(inputClip.findAllByProps({ mockComponent: 'hero-input' })).toHaveLength(1);
    expect(inputClip.findAllByType('button')).toHaveLength(0);
  });

  test('disables the password visibility action with the field', () => {
    renderInput(
      <Input
        accessibilityLabel="API key"
        disabled
        onChangeText={jest.fn()}
        type="password"
        value="secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    expect(renderer!.root.findByProps({ mockComponent: 'hero-input' }).props.isDisabled).toBe(true);
    expect(renderer!.root.findByType('button').props.disabled).toBe(true);
  });

  test('blurs a password before toggling when requested', () => {
    renderInput(
      <Input
        accessibilityLabel="API key"
        blurOnVisibilityToggle
        onChangeText={jest.fn()}
        type="password"
        value="secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    act(() => renderer!.root.findByType('button').props.onPress());

    expect(mockNativeInputNode.blur).toHaveBeenCalledTimes(1);
  });

  test('forwards a password ref to the native input', () => {
    const ref = createRef<TextInput>();

    renderInput(
      <Input
        ref={ref}
        accessibilityLabel="API key"
        onChangeText={jest.fn()}
        type="password"
        value="secret"
        visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
      />,
    );

    expect(ref.current).toBe(mockNativeInputNode);
  });
});
