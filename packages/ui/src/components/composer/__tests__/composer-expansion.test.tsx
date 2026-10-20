import { useLayoutEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerExpansion, useComposerExpansion } from '../components/composer-expansion';

const mockDismissKeyboard = jest.fn();
const mockTransitions: { complete?: (finished: boolean) => void; target: number }[] = [];
let mockKeyboardVisible = false;
let mockKeyboardHeight = 0;
let mockKeyboardProgress = 0;
let expansion: NonNullable<ReturnType<typeof useComposerExpansion>>;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardController: {
    isVisible: () => mockKeyboardVisible,
    dismiss: () => mockDismissKeyboard(),
  },
  useReanimatedKeyboardAnimation: () => ({
    height: { get: () => mockKeyboardHeight },
    progress: { get: () => mockKeyboardProgress },
  }),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Easing: { bezier: () => 'settle' },
    ReduceMotion: { System: 'system' },
    useSharedValue: (initial: unknown) =>
      React.useRef({
        current: initial,
        get() {
          return this.current;
        },
        set(next: unknown) {
          this.current = typeof next === 'function' ? next(this.current) : next;
        },
      }).current,
    useDerivedValue: (factory: () => number) => ({ get: factory }),
    withTiming: (target: number, _config: unknown, complete?: (finished: boolean) => void) => {
      mockTransitions.push({ target, complete });
      return target;
    },
  };
});

function Probe() {
  const current = useComposerExpansion()!;
  useLayoutEffect(() => {
    expansion = current;
  });
  return null;
}

describe('Composer expansion', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    mockTransitions.length = 0;
    mockKeyboardVisible = false;
    mockKeyboardHeight = 0;
    mockKeyboardProgress = 0;
    mockDismissKeyboard.mockClear();
    act(() => {
      renderer = create(
        <ComposerExpansion>
          <Probe />
        </ComposerExpansion>,
      );
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
  });

  it('ignores a closing completion that arrives after the user reopens the editor', () => {
    act(() => expansion.actions.expand());
    act(() => expansion.actions.collapse());
    const closing = mockTransitions.findLast((transition) => transition.target === 0)!;

    act(() => expansion.actions.expand());
    act(() => closing.complete?.(true));

    expect(expansion.state).toEqual({ isExpanded: true, isPresented: true });
  });

  it('can close an expansion before its first render has committed', () => {
    act(() => {
      expansion.actions.expand();
      expansion.actions.collapse();
    });
    expect(mockTransitions.at(-1)?.target).toBe(0);
    act(() => mockTransitions.at(-1)?.complete?.(true));
    expect(expansion.state).toEqual({ isExpanded: false, isPresented: false });
  });

  it('uses live keyboard geometry only while this composer owns keyboard tracking', () => {
    act(() => {
      renderer.root.findByType(View).props.onLayout({ nativeEvent: { layout: { height: 844 } } });
      expansion.meta.compactDockHeight.set(150);
      expansion.actions.expand();
    });
    expect(expansion.meta.extraHeight.get()).toBe(638);

    mockKeyboardHeight = -300;
    mockKeyboardProgress = 1;
    expansion.meta.keyboardTrackingEnabled.set(true);
    expect(expansion.meta.extraHeight.get()).toBe(364);

    expansion.meta.keyboardTrackingEnabled.set(false);
    expect(expansion.meta.extraHeight.get()).toBe(638);
  });

  it('lets Back hide the keyboard before collapsing the editing surface', () => {
    let back: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, callback) => {
      back = callback;
      return { remove: jest.fn() };
    });
    act(() => expansion.actions.expand());

    mockKeyboardVisible = true;
    act(() => {
      expect(back?.({ type: 'hardwareBackPress', timeStamp: 0 })).toBe(true);
    });
    expect(mockDismissKeyboard).toHaveBeenCalledTimes(1);
    expect(expansion.state.isExpanded).toBe(true);

    mockKeyboardVisible = false;
    act(() => {
      expect(back?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
    });
    expect(expansion.state.isExpanded).toBe(false);
  });
});
