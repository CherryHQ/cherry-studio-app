import { readFileSync } from 'node:fs';

type Cell<T> = { value: T };
type InsetOptions = {
  scrollViewRef: object;
  extraContentPadding: Cell<number>;
  keyboardPadding: Cell<number>;
  blankSpace: Cell<number>;
  scroll: Cell<number>;
  layout: Cell<{ height: number }>;
  size: Cell<{ height: number }>;
  contentOffsetY: Cell<number>;
  inverted: boolean;
  keyboardLiftBehavior: 'persistent' | 'never';
  freeze: Cell<boolean>;
};

let mockInsetChanged: (current: number, previous: number) => void;

jest.mock('react', () => ({ useCallback: (callback: unknown) => callback }));
jest.mock('react-native-reanimated', () => ({
  useSharedValue: <T>(value: T) => ({ value }),
}));
jest.mock('react-native-keyboard-controller/lib/commonjs/architecture', () => ({
  IS_FABRIC: true,
}));
jest.mock('react-native-keyboard-controller/lib/commonjs/reanimated', () => ({
  useAnimatedReaction: (_read: unknown, changed: typeof mockInsetChanged) => {
    mockInsetChanged = changed;
  },
}));

// Exercise pending scroll targets without simulating native keyboard animation.
const { useExtraContentPadding: createInsetHarness } = jest.requireActual<{
  useExtraContentPadding: (options: InsetOptions) => void;
}>(
  'react-native-keyboard-controller/lib/commonjs/components/KeyboardChatScrollView/useExtraContentPadding/index.js',
);

describe('animated composer inset', () => {
  let options: InsetOptions;

  beforeEach(() => {
    options = {
      scrollViewRef: {},
      extraContentPadding: { value: 0 },
      keyboardPadding: { value: 0 },
      blankSpace: { value: 0 },
      scroll: { value: 600 },
      layout: { value: { height: 600 } },
      size: { value: { height: 1_200 } },
      contentOffsetY: { value: 600 },
      inverted: false,
      keyboardLiftBehavior: 'persistent',
      freeze: { value: false },
    };
    createInsetHarness(options);
  });

  function resize(height: number) {
    const previous = options.extraContentPadding.value;
    options.extraContentPadding.value = height;
    mockInsetChanged(height, previous);
  }

  test('accumulates all height changes while native scroll events lag behind', () => {
    for (const height of [4, 9, 14, 19, 22]) resize(height);
    expect(options.contentOffsetY.value).toBe(622);

    for (const height of [19, 14, 9, 4, 0]) resize(height);
    expect(options.contentOffsetY.value).toBe(600);
  });

  test('rebases on the observed position after a native scroll event', () => {
    resize(10);
    options.scroll.value = 550;
    resize(20);
    expect(options.contentOffsetY.value).toBe(560);
    resize(30);
    expect(options.contentOffsetY.value).toBe(570);
  });

  test('leaves a reader in place while the composer grows', () => {
    options.keyboardLiftBehavior = 'never';
    for (const height of [10, 20, 30]) resize(height);
    expect(options.contentOffsetY.value).toBe(600);
  });

  test.each([
    'src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts',
    'lib/module/components/KeyboardChatScrollView/useExtraContentPadding/index.js',
  ])('keeps the pending-target fix in the runtime entry point: %s', (path) => {
    const source = readFileSync(
      `${process.cwd()}/node_modules/react-native-keyboard-controller/${path}`,
      'utf8',
    );
    expect(source).toContain('lastCommanded.value = target');
    expect(source).toContain('scroll.value === lastObservedScroll.value');
    expect(source).toContain('base + effectiveDelta');
  });
});
