import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerEditor } from '../components/composer-editor';

const mockTransitions: { duration: number; target: number }[] = [];
const mockReactions: {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
  last: unknown;
}[] = [];

jest.mock('@cherrystudio/app-icons/icons/maximize-2', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/minimize-2', () => () => null);

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'settle' },
    Extrapolation: { CLAMP: 'clamp' },
    ReduceMotion: { System: 'system' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0]! + (output[1]! - output[0]!) * value,
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (current: unknown, previous: unknown) => void,
    ) => {
      const entry = React.useRef({ prepare, react, last: null as unknown }).current;
      entry.prepare = prepare;
      entry.react = react;
      if (!mockReactions.includes(entry)) mockReactions.push(entry);
    },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (initial: unknown) =>
      React.useRef({
        current: initial,
        get() {
          return this.current;
        },
        set(next: unknown) {
          this.current = next;
        },
      }).current,
    withTiming: (target: number, config: { duration: number }) => {
      mockTransitions.push({ duration: config.duration, target });
      return target;
    },
  };
});

jest.mock('../components/composer-expansion', () => ({
  ComposerExpansionMeasure: ({ children }: { children: unknown }) => children,
  useComposerExpansion: () => null,
}));

function signal(value: boolean) {
  const cell = { current: value };
  return Object.assign(cell, {
    get: () => cell.current,
    set: (next: boolean) => {
      cell.current = next;
    },
  }) as unknown as SharedValue<boolean> & { current: boolean };
}

function flushReactions() {
  for (const reaction of mockReactions) {
    const current = reaction.prepare();
    if (current !== reaction.last) {
      reaction.react(current, reaction.last);
      reaction.last = current;
    }
  }
}

function activeTargets() {
  // Each shape change animates progress first, then the field frame.
  return mockTransitions.filter((_, index) => index % 2 === 0).map(({ target }) => target);
}

describe('Composer.Editor', () => {
  let renderer: ReactTestRenderer;
  const activeSignal = signal(false);
  const renderEditor = (active: boolean) => (
    <ComposerEditor
      active={active}
      activeSignal={activeSignal}
      expandLabel="Expand"
      field={<View />}
    />
  );

  beforeEach(() => {
    mockTransitions.length = 0;
    mockReactions.length = 0;
    activeSignal.current = false;
    act(() => {
      renderer = create(renderEditor(false));
    });
    flushReactions();
  });

  afterEach(() => act(() => renderer.unmount()));

  it('starts the short shape change from the signal and ignores the later commit', () => {
    activeSignal.set(true);
    flushReactions();
    expect(activeTargets()).toEqual([1]);
    expect(mockTransitions[0]!.duration).toBe(90);

    act(() => renderer.update(renderEditor(true)));
    flushReactions();
    expect(activeTargets()).toEqual([1]);

    act(() => renderer.update(renderEditor(false)));
    flushReactions();
    expect(activeTargets()).toEqual([1, 0]);
  });

  it('keeps an editor that is still active when the signal drops', () => {
    activeSignal.set(true);
    flushReactions();
    act(() => renderer.update(renderEditor(true)));
    flushReactions();

    activeSignal.set(false);
    flushReactions();
    expect(activeTargets()).toEqual([1]);
  });

  it('hands an uncommitted raise back to the inactive state', () => {
    activeSignal.set(true);
    flushReactions();
    activeSignal.set(false);
    flushReactions();
    expect(activeTargets()).toEqual([1, 0]);
  });
});
