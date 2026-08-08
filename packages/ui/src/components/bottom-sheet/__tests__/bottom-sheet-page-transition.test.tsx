import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheetPageTransition } from '../bottom-sheet-page-transition';

let mockAnimationFinished: ((finished: boolean) => void) | undefined;
let mockReducedMotion = false;
let mockTimingConfig: unknown;

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    Easing: { bezier: () => 'settle' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: number) => {
      const ref = React.useRef(null) as {
        current: { set: (next: number) => void; value: number } | null;
      };

      ref.current ??= {
        set(next: number) {
          this.value = next;
        },
        value: initial,
      };
      return ref.current;
    },
    withTiming: (value: number, config: unknown, callback: (finished: boolean) => void) => {
      mockAnimationFinished = callback;
      mockTimingConfig = config;
      return value;
    },
  };
});

function page(pageKey: string, depth: number) {
  return (
    <BottomSheetPageTransition depth={depth} pageKey={pageKey} testID="page-transition">
      <Text testID={`page-${pageKey}`}>{pageKey}</Text>
    </BottomSheetPageTransition>
  );
}

describe('BottomSheet.PageTransition', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockAnimationFinished = undefined;
    mockReducedMotion = false;
    mockTimingConfig = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the initial page without an outgoing layer', () => {
    act(() => {
      renderer = create(page('root', 0));
    });

    expect(renderer?.root.findByProps({ testID: 'page-root' })).toBeDefined();
    expect(renderer?.root.findAllByProps({ testID: 'page-transition-outgoing' })).toHaveLength(0);
  });

  test('pushes forward and retains the previous page until timing completes', () => {
    act(() => {
      renderer = create(page('root', 0));
    });
    act(() => renderer?.update(page('details', 1)));

    const outgoing = renderer?.root.findByProps({ testID: 'page-transition-outgoing' });
    const active = renderer?.root.findByProps({ testID: 'page-transition-active' });
    expect(outgoing?.findByProps({ testID: 'page-root' })).toBeDefined();
    expect(active?.findByProps({ testID: 'page-details' })).toBeDefined();
    expect(outgoing?.props.pointerEvents).toBe('none');
    expect(outgoing?.props.accessibilityElementsHidden).toBe(true);
    expect(StyleSheet.flatten(outgoing?.props.style).transform).toEqual([{ translateX: -8 }]);
    expect(mockTimingConfig).toEqual({ duration: 250, easing: 'settle' });

    act(() => mockAnimationFinished?.(true));
    expect(renderer?.root.findAllByProps({ testID: 'page-transition-outgoing' })).toHaveLength(0);
  });

  test('reverses the horizontal direction when stack depth decreases', () => {
    act(() => {
      renderer = create(page('details', 2));
    });
    act(() => renderer?.update(page('root', 0)));

    const outgoing = renderer?.root.findByProps({ testID: 'page-transition-outgoing' });
    expect(StyleSheet.flatten(outgoing?.props.style).transform).toEqual([{ translateX: 8 }]);
  });

  test('uses a stationary cross-fade for same-depth replacement', () => {
    act(() => {
      renderer = create(page('quality', 1));
    });
    act(() => renderer?.update(page('resolution', 1)));

    const outgoing = renderer?.root.findByProps({ testID: 'page-transition-outgoing' });
    expect(StyleSheet.flatten(outgoing?.props.style).transform).toEqual([{ translateX: 0 }]);
  });

  test('switches immediately when Reduce Motion is enabled', () => {
    mockReducedMotion = true;
    act(() => {
      renderer = create(page('root', 0));
    });
    act(() => renderer?.update(page('details', 1)));

    expect(renderer?.root.findByProps({ testID: 'page-details' })).toBeDefined();
    expect(renderer?.root.findAllByProps({ testID: 'page-transition-outgoing' })).toHaveLength(0);
  });
});
