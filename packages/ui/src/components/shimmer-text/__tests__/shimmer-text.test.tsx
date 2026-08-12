import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ShimmerText } from '../shimmer-text';

let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithRepeat = jest.fn(
  (animation: unknown, _numberOfReps?: number, _reverse?: boolean) => animation,
);
const mockWithTiming = jest.fn((value: unknown, _config?: unknown) => value);

jest.mock('@react-native-masked-view/masked-view', () => {
  const { View } = jest.requireActual('react-native');

  function MockMaskedView(props: object) {
    return <View {...props} />;
  }

  return { __esModule: true, default: MockMaskedView };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');

  function MockLinearGradient(props: object) {
    return <View {...props} />;
  }

  return { LinearGradient: MockLinearGradient };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ color: 'cherry-foreground-tertiary' }),
}));

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  const useSharedValue = (initialValue: number) => {
    const ref = React.useRef(null) as {
      current: {
        get: () => number;
        set: (nextValue: number) => void;
        value: number;
      } | null;
    };
    ref.current ??= {
      get() {
        return this.value;
      },
      set(nextValue: number) {
        this.value = nextValue;
      },
      value: initialValue,
    };
    return ref.current;
  };

  return {
    __esModule: true,
    cancelAnimation: (value: unknown) => mockCancelAnimation(value),
    default: { View },
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
    useSharedValue,
    withRepeat: (animation: unknown, numberOfReps?: number, reverse?: boolean) =>
      mockWithRepeat(animation, numberOfReps, reverse),
    withTiming: (value: unknown, config?: unknown) => mockWithTiming(value, config),
  };
});

describe('ShimmerText', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockReducedMotion = false;
    mockCancelAnimation.mockClear();
    mockWithRepeat.mockClear();
    mockWithTiming.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('sweeps a soft token-colored gradient through the text glyphs', () => {
    act(() => {
      renderer = create(
        <ShimmerText className="font-mono text-xs" numberOfLines={1} testID="status">
          Generating image
        </ShimmerText>,
      );
    });

    const baseText = renderer!.root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'status')!;
    expect(baseText.props.className).toBe('font-mono text-xs text-foreground');

    act(() => {
      baseText.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
    });

    const mask = renderer!.root.findByType(MaskedView);
    const gradient = renderer!.root.findByType(LinearGradient);
    const maskText = mask.props.maskElement;

    expect(mask.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
    });
    expect(StyleSheet.flatten(mask.props.style)).toMatchObject({
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    });
    expect(maskText.type).toBe(Text);
    expect(maskText.props).toMatchObject({
      children: 'Generating image',
      className: 'font-mono text-xs text-foreground',
      numberOfLines: 1,
    });
    expect(gradient.props).toMatchObject({
      colors: ['transparent', 'cherry-foreground-tertiary', 'transparent'],
      locations: [0, 0.5, 1],
    });
    expect(mockWithTiming).toHaveBeenCalledWith(100, {
      duration: 2000,
      easing: 'linear',
    });
    expect(mockWithRepeat).toHaveBeenCalledWith(100, -1, false);
  });

  it.each([
    ['inactive', false, false],
    ['Reduce Motion', true, true],
  ])('shows static foreground text when %s', (_case, active, reducedMotion) => {
    mockReducedMotion = reducedMotion;

    act(() => {
      renderer = create(<ShimmerText active={active}>Generating image</ShimmerText>);
    });
    const baseText = renderer!.root.findByType(Text);
    act(() => {
      baseText.props.onLayout({ nativeEvent: { layout: { width: 100 } } });
    });

    expect(renderer!.root.findAllByType(MaskedView)).toHaveLength(0);
    expect(baseText.props.className).toBe('text-foreground');
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });
});
