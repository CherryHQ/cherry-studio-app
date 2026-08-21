import type { TextInputProps } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SecureInput } from '../secure-input';

const mockSetNativeProps = jest.fn();

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
  const MockInput = React.forwardRef((props: object, ref: React.ForwardedRef<unknown>) => {
    React.useImperativeHandle(ref, () => ({ setNativeProps: mockSetNativeProps }));
    return React.createElement('secure-input-native', props);
  });
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
    mockSetNativeProps.mockClear();
  });

  test('resets the blurred display to the start while forwarding onBlur', () => {
    const onBlur = jest.fn();
    const event = { nativeEvent: { target: 1 } } as Parameters<
      NonNullable<TextInputProps['onBlur']>
    >[0];

    act(() => {
      renderer = create(
        <SecureInput
          accessibilityLabel="API key"
          onBlur={onBlur}
          onChangeText={jest.fn()}
          value="a-very-long-secret"
          visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
        />,
      );
    });

    const nativeInput = renderer!.root.findByType('secure-input-native');

    act(() => {
      nativeInput.props.onBlur(event);
    });

    expect(onBlur).toHaveBeenCalledWith(event);
    expect(mockSetNativeProps).toHaveBeenCalledWith({ selection: { end: 0, start: 0 } });
    expect(nativeInput.props.value).toBe('a-very-long-secret');
  });
});
