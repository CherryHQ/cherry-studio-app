import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScrollToBottomButton } from '../ScrollToBottomButton';

jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { fast: 160 },
  easing: { settle: 'settle' },
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    Surface: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Surface', props, children),
  };
});

jest.mock('@cherrystudio/app-icons', () => {
  const React = jest.requireActual('react');

  return {
    ArrowDownIcon: (props: object) => React.createElement('ArrowDownIcon', props),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');

  function MockAnimatedView({
    animatedProps,
    children,
    ...props
  }: {
    animatedProps?: object;
    children?: React.ReactNode;
  }) {
    return React.createElement('AnimatedView', { ...props, ...animatedProps }, children);
  }

  return {
    __esModule: true,
    default: { View: MockAnimatedView },
    useAnimatedProps: (factory: () => object) => factory(),
    useAnimatedStyle: (factory: () => object) => factory(),
    withTiming: (value: number) => value,
  };
});

function sharedValue<T>(value: T): SharedValue<T> {
  return { get: () => value } as SharedValue<T>;
}

describe('ScrollToBottomButton', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses the Cherry UI surface and preserves the button interaction', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <ScrollToBottomButton
          gap={8}
          inputHeight={sharedValue(72)}
          isHidden={sharedValue(false)}
          onPress={onPress}
        />,
      );
    });

    expect(renderer!.root.findByType('Surface').props).toMatchObject({
      className: 'border border-border bg-secondary',
      cornerRadius: 20,
      interactive: true,
    });

    const button = renderer!.root.findByProps({ accessibilityLabel: '滚动到底部' });
    expect(button.props).toMatchObject({
      accessibilityLabel: '滚动到底部',
      accessibilityRole: 'button',
      hitSlop: 8,
    });

    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
