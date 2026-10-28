import { useLayoutEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerExpansion, useComposerExpansion } from '../components/composer-expansion';

const mockDismissKeyboard = jest.fn();
const mockTransitions: { complete?: (finished: boolean) => void; target: number }[] = [];
const mockReactions: {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
  last?: { value: unknown };
}[] = [];
const mockDelayed = new Map<object, number>();
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

// Delayed animations hold the current value until a test lets the delay pass.
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Easing: { bezier: () => 'settle' },
    ReduceMotion: { System: 'system' },
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (current: unknown, previous: unknown) => void,
    ) => {
      const reaction = React.useRef<(typeof mockReactions)[number] | null>(null);
      if (!reaction.current) {
        reaction.current = { prepare, react };
        mockReactions.push(reaction.current);
      }
      reaction.current.prepare = prepare;
      reaction.current.react = react;
    },
    useSharedValue: (initial: unknown) =>
      React.useRef({
        current: initial,
        get() {
          return this.current;
        },
        set(next: unknown) {
          mockDelayed.delete(this);
          if (next && typeof next === 'object' && 'delayed' in next) {
            mockDelayed.set(this, (next as { delayed: number }).delayed);
            return;
          }
          this.current = typeof next === 'function' ? next(this.current) : next;
        },
      }).current,
    useDerivedValue: (factory: () => number) => ({ get: factory }),
    withDelay: (_delay: number, animation: number) => ({ delayed: animation }),
    withTiming: (target: number, _config: unknown, complete?: (finished: boolean) => void) => {
      mockTransitions.push({ target, complete });
      return target;
    },
  };
});

function flushReactions() {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const reaction of mockReactions) {
      const current = reaction.prepare();
      if (reaction.last && Object.is(reaction.last.value, current)) continue;
      const previous = reaction.last ? reaction.last.value : null;
      reaction.last = { value: current };
      reaction.react(current, previous);
    }
  }
}

function moveKeyboard(progress: number) {
  mockKeyboardProgress = progress;
  flushReactions();
}

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
    mockReactions.length = 0;
    mockDelayed.clear();
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

  describe('content inset', () => {
    function report(height: number, isActive: boolean, isSettled = true) {
      act(() => expansion.actions.reportEditorGrowth({ height, isActive, isSettled }));
      flushReactions();
    }

    beforeEach(() => {
      flushReactions();
      report(0, false);
      act(() => expansion.actions.recordDockHeight(150));
    });

    it('gives the editor its room on the keyboard curve and ignores the morphing dock', () => {
      expansion.meta.keyboardTrackingEnabled.set(true);
      report(48, true, false);
      expect(expansion.meta.contentInset.get()).toBe(150);

      moveKeyboard(0.5);
      act(() => expansion.actions.recordDockHeight(170));
      expect(expansion.meta.contentInset.get()).toBe(174);

      moveKeyboard(1);
      expect(expansion.meta.contentInset.get()).toBe(198);
      act(() => expansion.actions.recordDockHeight(198));
      report(48, true);
      expect(expansion.meta.contentInset.get()).toBe(198);

      expansion.meta.keyboardTrackingEnabled.set(true);
      report(0, false, false);
      moveKeyboard(0.25);
      expect(expansion.meta.contentInset.get()).toBe(162);
      moveKeyboard(0);
      expect(expansion.meta.contentInset.get()).toBe(150);
    });

    it('lands content growth while the keyboard is still on its way', () => {
      expansion.meta.keyboardTrackingEnabled.set(true);
      report(48, true, false);
      moveKeyboard(0.5);
      report(70, true, false);
      moveKeyboard(1);
      expect(expansion.meta.contentInset.get()).toBe(220);
    });

    it('follows the editor timing without a keyboard on its way', () => {
      report(48, true, false);
      expect(expansion.meta.contentInset.get()).toBe(198);
    });

    it('hands the room to timing when the keyboard never starts', () => {
      expansion.meta.keyboardTrackingEnabled.set(true);
      report(48, true, false);
      expect(expansion.meta.contentInset.get()).toBe(150);

      const [[growth, target]] = [...mockDelayed];
      (growth as { set: (value: number) => void }).set(target);
      act(() => mockTransitions.at(-1)?.complete?.(true));
      moveKeyboard(0.5);
      expect(expansion.meta.contentInset.get()).toBe(198);
    });

    it('applies typing growth with the frame that shows it and clears with the dock', () => {
      report(48, true);
      act(() => expansion.actions.recordDockHeight(198));
      report(70, true);
      expect(expansion.meta.contentInset.get()).toBe(220);

      act(() => expansion.actions.releaseDock());
      report(0, false);
      expect(expansion.meta.contentInset.get()).toBe(0);
    });
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
