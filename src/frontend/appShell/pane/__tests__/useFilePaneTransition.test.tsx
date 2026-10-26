import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useFilePaneTransition } from '../useFilePaneTransition';

let mockReducedMotion = false;
const mockWithTiming = jest.fn(
  (target: number, _config: unknown, _complete?: (finished: boolean) => void) => target,
);
jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { fast: 200 },
  easing: { settle: 'settle' },
}));
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => mockReducedMotion,
  useSharedValue: (initial: number) => {
    const { useRef } = jest.requireActual('react');
    const ref = useRef({
      value: initial,
      get() {
        return this.value;
      },
      set(next: number) {
        this.value = next;
      },
    });
    return ref.current;
  },
  useAnimatedStyle: (read: () => { opacity: number }) =>
    Object.defineProperty({}, 'opacity', { get: () => read().opacity }),
  withTiming: (target: number, config: unknown, complete?: (finished: boolean) => void) =>
    mockWithTiming(target, config, complete),
  cancelAnimation: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (generation: number) => void, generation: number) =>
    callback(generation),
}));

let result: ReturnType<typeof useFilePaneTransition>;
let renderer: ReactTestRenderer;
let inputs = { isPresented: true, isYielding: false, isStacked: true, isLayoutCurrent: true };
function Probe(props: typeof inputs) {
  const current = useFilePaneTransition(
    props.isPresented,
    props.isYielding,
    props.isStacked,
    props.isLayoutCurrent,
  );
  useEffect(() => {
    result = current;
  });
  return null;
}
function update(next: Partial<typeof inputs>) {
  inputs = { ...inputs, ...next };
  act(() => renderer.update(<Probe {...inputs} />));
}
function finish() {
  act(() => mockWithTiming.mock.lastCall![2]!(true));
}
beforeEach(() => {
  mockReducedMotion = false;
  mockWithTiming.mockClear();
  inputs = { isPresented: true, isYielding: false, isStacked: true, isLayoutCurrent: true };
  act(() => {
    renderer = create(<Probe {...inputs} />);
  });
});
afterEach(() => act(() => renderer.unmount()));

it('gives chat its space immediately and returns it only after the pane has faded in', () => {
  update({ isYielding: true });
  expect(result).toMatchObject({ hasSpace: false, isVisible: false });
  expect(mockWithTiming.mock.lastCall!.slice(0, 2)).toEqual([
    0,
    { duration: 200, easing: 'settle' },
  ]);
  update({ isYielding: false });
  expect(result).toMatchObject({ hasSpace: false, isVisible: true });
  expect(mockWithTiming.mock.lastCall![0]).toBe(1);
  finish();
  expect(result.hasSpace).toBe(true);
});

it('switches directly to complete layouts with reduced motion', () => {
  mockReducedMotion = true;
  update({ isYielding: true });
  expect(result).toMatchObject({ hasSpace: false, isVisible: false, style: { opacity: 0 } });
  update({ isYielding: false });
  expect(result).toMatchObject({ hasSpace: true, isVisible: true, style: { opacity: 1 } });
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('does not let an earlier completion reserve space during a later reverse animation', () => {
  update({ isYielding: true });
  update({ isYielding: false });
  const oldCompletion = mockWithTiming.mock.lastCall![2]!;
  update({ isYielding: true });
  update({ isYielding: false });
  act(() => oldCompletion(true));
  expect(result.hasSpace).toBe(false);
  finish();
  expect(result.hasSpace).toBe(true);
});

it('does not reserve space after a cancelled restore', () => {
  update({ isYielding: true });
  update({ isYielding: false });
  act(() => mockWithTiming.mock.lastCall![2]!(false));
  expect(result.hasSpace).toBe(false);
});

it('snaps on close, availability changes and reopening, even during a restore', () => {
  update({ isYielding: true });
  update({ isYielding: false });
  const completion = mockWithTiming.mock.lastCall![2]!;
  mockWithTiming.mockClear();
  update({ isPresented: false });
  expect(result).toMatchObject({ hasSpace: false, isVisible: false, style: { opacity: 0 } });
  act(() => completion(true));
  expect(result.hasSpace).toBe(false);
  update({ isPresented: true });
  expect(result).toMatchObject({ hasSpace: true, isVisible: true, style: { opacity: 1 } });
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('does not fade a resize from stacked to side by side', () => {
  update({ isYielding: true });
  mockWithTiming.mockClear();
  update({ isYielding: false, isStacked: false });
  expect(result).toMatchObject({ hasSpace: true, isVisible: true, style: { opacity: 1 } });
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('finishes an in-flight restore immediately when motion is reduced', () => {
  update({ isYielding: true });
  update({ isYielding: false });
  mockReducedMotion = true;
  update({});
  expect(result).toMatchObject({ hasSpace: true, isVisible: true, style: { opacity: 1 } });
});

it('keeps a shown pane over a full-width chat while a snapshot is stale', () => {
  update({ isLayoutCurrent: false, isPresented: false });
  expect(result).toMatchObject({ hasSpace: false, isVisible: true, style: { opacity: 1 } });
  update({ isLayoutCurrent: true });
  expect(result).toMatchObject({ hasSpace: false, isVisible: false, style: { opacity: 0 } });
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('does not reveal a pane from a stale snapshot', () => {
  update({ isPresented: false });
  update({ isLayoutCurrent: false, isPresented: true });
  expect(result).toMatchObject({ hasSpace: false, isVisible: false, style: { opacity: 0 } });
  update({ isLayoutCurrent: true });
  expect(result).toMatchObject({ hasSpace: true, isVisible: true, style: { opacity: 1 } });
  expect(mockWithTiming).not.toHaveBeenCalled();
});
