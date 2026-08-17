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

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({
    backgroundColor: 'rgba(120, 120, 120, 0.24)',
    borderColor: 'rgba(160, 160, 160, 0.3)',
    borderWidth: 1,
  }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');

  function MockAnimatedView({ children, ...props }: { children?: React.ReactNode }) {
    return React.createElement('AnimatedView', props, children);
  }

  return {
    __esModule: true,
    default: { View: MockAnimatedView },
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
          isAtBottom={false}
          onPress={onPress}
        />,
      );
    });

    expect(renderer!.root.findByType('Surface').props).toMatchObject({
      className: 'border border-border bg-secondary',
      cornerRadius: 20,
      interactive: true,
      style: [
        { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
        { borderColor: 'rgba(160, 160, 160, 0.3)', borderWidth: 1 },
      ],
      tintColor: 'rgba(120, 120, 120, 0.24)',
    });

    const animatedViews = renderer!.root.findAllByType('AnimatedView');
    expect(animatedViews[1].props).toMatchObject({
      pointerEvents: 'auto',
      style: [{ transform: [{ scale: 1 }] }, { opacity: 1 }],
    });

    const button = renderer!.root.findByProps({ accessibilityLabel: '滚动到底部' });
    expect(button.props).toMatchObject({
      accessibilityLabel: '滚动到底部',
      accessibilityRole: 'button',
      hitSlop: 8,
    });

    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      renderer?.update(
        <ScrollToBottomButton gap={8} inputHeight={sharedValue(72)} isAtBottom onPress={onPress} />,
      );
    });
    expect(renderer!.root.findAllByType('AnimatedView')[1].props).toMatchObject({
      pointerEvents: 'none',
      style: [{ transform: [{ scale: 0.8 }] }, { opacity: 0 }],
    });

    act(() => {
      renderer?.update(
        <ScrollToBottomButton
          gap={8}
          inputHeight={sharedValue(72)}
          isAtBottom={false}
          onPress={onPress}
        />,
      );
    });
    expect(renderer!.root.findAllByType('AnimatedView')[1].props).toMatchObject({
      pointerEvents: 'auto',
      style: [{ transform: [{ scale: 1 }] }, { opacity: 1 }],
    });
  });
});
