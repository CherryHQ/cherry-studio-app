import type { TextInputProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SecureInput } from '../secure-input';

jest.mock('@cherrystudio/app-icons', () => ({
  EyeIcon: () => null,
  EyeOffIcon: () => null,
}));

jest.mock('heroui-native/hooks', () => ({
  useIsOnSurface: () => false,
}));

jest.mock('heroui-native/utils', () => ({
  cn: (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

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

jest.mock('../../input', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const MockInput = React.forwardRef((props: object, _ref: React.ForwardedRef<unknown>) =>
    React.createElement('secure-input-native', props),
  );
  MockInput.displayName = 'MockInput';

  return {
    Input: MockInput,
  };
});

jest.mock('../../text-field', () => ({
  useTextField: () => undefined,
}));

describe('SecureInput', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('shows the start while blurred and releases selection while focused', () => {
    const onBlur = jest.fn();
    const onFocus = jest.fn();
    const blurEvent = { nativeEvent: { target: 1 } } as Parameters<
      NonNullable<TextInputProps['onBlur']>
    >[0];
    const focusEvent = { nativeEvent: { target: 1 } } as Parameters<
      NonNullable<TextInputProps['onFocus']>
    >[0];

    act(() => {
      renderer = create(
        <SecureInput
          accessibilityLabel="API key"
          onBlur={onBlur}
          onChangeText={jest.fn()}
          onFocus={onFocus}
          value="a-very-long-secret"
          visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
        />,
      );
    });

    const nativeInput = renderer!.root.findByType('secure-input-native');
    expect(nativeInput.props.selection).toEqual({ end: 0, start: 0 });

    act(() => {
      nativeInput.props.onFocus(focusEvent);
    });

    expect(onFocus).toHaveBeenCalledWith(focusEvent);
    expect(nativeInput.props.selection).toBeUndefined();

    act(() => {
      nativeInput.props.onBlur(blurEvent);
    });

    expect(onBlur).toHaveBeenCalledWith(blurEvent);
    expect(nativeInput.props.selection).toEqual({ end: 0, start: 0 });
  });

  test('clips native text before the trailing visibility action', () => {
    act(() => {
      renderer = create(
        <SecureInput
          accessibilityLabel="API key"
          onChangeText={jest.fn()}
          value="a-very-long-secret"
          visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
        />,
      );
    });

    const inputClip = renderer!.root.findByProps({
      className: 'min-w-0 flex-1 overflow-hidden',
    });

    expect(inputClip.findAllByType('secure-input-native')).toHaveLength(1);
    expect(inputClip.findAllByType('button')).toHaveLength(0);
  });
});
