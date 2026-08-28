import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScrollToBottomButton } from '../components/scroll-to-bottom-button';

jest.mock('../../../motion', () => ({
  duration: { fast: 160 },
  easing: { settle: 'settle' },
}));

jest.mock('../../surface', () => {
  const React = jest.requireActual('react');

  return {
    Surface: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Surface', props, children),
  };
});

jest.mock('@cherrystudio/app-icons/icons/arrow-down', () => {
  const React = jest.requireActual('react');
  return function MockArrowDownIcon(props: object) {
    return React.createElement('ArrowDownIcon', props);
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

  it('positions above the accessory and preserves the visible button interaction', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <ScrollToBottomButton
          accessibilityLabel="Scroll to bottom"
          bottomAccessoryHeight={sharedValue(72)}
          gap={8}
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
    expect(animatedViews[0].props.style).toEqual([
      { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
      { bottom: 80 },
    ]);
    expect(animatedViews[1].props).toMatchObject({
      pointerEvents: 'auto',
      style: [{ transform: [{ scale: 1 }] }, { opacity: 1 }],
    });

    const button = renderer!.root.findByType('View');
    expect(button.props).toMatchObject({
      accessibilityLabel: 'Scroll to bottom',
      accessibilityRole: 'button',
      hitSlop: 8,
    });

    act(() => button.props.onClick({}));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides and disables the button at the bottom', () => {
    act(() => {
      renderer = create(
        <ScrollToBottomButton
          accessibilityLabel="Scroll to bottom"
          bottomAccessoryHeight={sharedValue(72)}
          gap={8}
          isAtBottom
          onPress={jest.fn()}
        />,
      );
    });

    expect(renderer!.root.findAllByType('AnimatedView')[1].props).toMatchObject({
      pointerEvents: 'none',
      style: [{ transform: [{ scale: 0.8 }] }, { opacity: 0 }],
    });
  });

  it('uses the list edge when there is no floating accessory', () => {
    act(() => {
      renderer = create(
        <ScrollToBottomButton
          accessibilityLabel="Scroll to bottom"
          gap={5}
          isAtBottom={false}
          onPress={jest.fn()}
        />,
      );
    });

    expect(renderer!.root.findAllByType('AnimatedView')[0].props.style).toEqual([
      { alignItems: 'center', left: 0, position: 'absolute', right: 0 },
      { bottom: 5 },
    ]);
  });
});
