import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useEffortSliderGesture } from '../useEffortSliderGesture';

let mockBegin: (event: { x: number }) => void;
let mockUpdate: (event: { x: number }) => void;
let mockFinalize: (event: object, success: boolean) => void;

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const gesture = {
        enabled: () => gesture,
        minDistance: () => gesture,
        onBegin: (callback: typeof mockBegin) => {
          mockBegin = callback;
          return gesture;
        },
        onUpdate: (callback: typeof mockUpdate) => {
          mockUpdate = callback;
          return gesture;
        },
        onFinalize: (callback: typeof mockFinalize) => {
          mockFinalize = callback;
          return gesture;
        },
      };
      return gesture;
    },
  },
}));
jest.mock('react-native-reanimated', () => ({
  Easing: { cubic: (value: number) => value, out: (easing: unknown) => easing },
  runOnJS: (callback: unknown) => callback,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));

test.each([true, false])('a gesture commits only on successful release (%s)', (success) => {
  const onCommit = jest.fn();
  let state: ReturnType<typeof useEffortSliderGesture>;
  let renderer: ReactTestRenderer;
  function Harness() {
    const current = useEffortSliderGesture({
      stopCount: 3,
      initialIndex: 1,
      disabled: false,
      reducedMotion: true,
      thumbCenterInset: 0,
      onCommit,
    });
    useEffect(() => {
      state = current;
      state.trackWidth.value = 100;
    }, [current]);
    return null;
  }
  act(() => {
    renderer = create(<Harness />);
  });
  act(() => {
    mockBegin({ x: 50 });
    mockUpdate({ x: 100 });
  });
  expect(state!.activeStopIndex.value).toBe(2);
  expect(onCommit).not.toHaveBeenCalled();
  act(() => mockFinalize({}, success));
  expect(state!.isPressed.value).toBe(false);
  if (success) {
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(2);
    expect(state!.position.value).toBe(1);
  } else {
    expect(onCommit).not.toHaveBeenCalled();
    expect(state!.activeStopIndex.value).toBe(1);
    expect(state!.position.value).toBe(0.5);
  }
  act(() => renderer.unmount());
});
