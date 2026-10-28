import { readFileSync } from 'node:fs';

type KeyboardFrame = { height: number; duration: number };
type KeyboardHandlers = Record<'onStart' | 'onMove' | 'onEnd', (frame: KeyboardFrame) => void>;
type Cell<T> = { value: T };
type Options = {
  inverted: boolean;
  keyboardLiftBehavior: 'never' | 'persistent';
  freeze: Cell<boolean>;
  offset: number;
  blankSpace: Cell<number>;
  extraContentPadding: Cell<number>;
};

let mockHandlers: KeyboardHandlers;
let mockInsetChanged: (current: number, previous: number) => void;
let mockScrollState: {
  offset: Cell<number>;
  layout: Cell<{ height: number }>;
  size: Cell<{ height: number }>;
};
const mockScrollTo = jest.fn();

jest.mock('react', () => ({ useCallback: (callback: unknown) => callback }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('react-native-reanimated', () => ({
  scrollTo: (...args: unknown[]) => mockScrollTo(...args),
  useSharedValue: <T>(value: T) => ({ value }),
}));
jest.mock('react-native-keyboard-controller/lib/commonjs/reanimated', () => ({
  useAnimatedReaction: (_read: unknown, changed: typeof mockInsetChanged) => {
    mockInsetChanged = changed;
  },
}));
jest.mock('react-native-keyboard-controller/lib/commonjs/hooks', () => ({
  useKeyboardHandler: (handlers: KeyboardHandlers) => {
    mockHandlers = handlers;
  },
}));
jest.mock('react-native-keyboard-controller/lib/commonjs/components/hooks/useScrollState', () => ({
  __esModule: true,
  default: () => mockScrollState,
}));

// Exercise the installed Android algorithm with explicit frames and geometry.
// This does not simulate the native animation, scroll view, or layout scheduling.
const { useChatKeyboard: createKeyboardHarness } = jest.requireActual<{
  useChatKeyboard: (
    ref: object,
    options: Options,
  ) => { padding: Cell<number>; pinnedToEnd?: Cell<boolean> };
}>(
  'react-native-keyboard-controller/lib/commonjs/components/KeyboardChatScrollView/useChatKeyboard/index.js',
);
const { useExtraContentPadding: createInsetHarness } = jest.requireActual<{
  useExtraContentPadding: (options: object) => void;
}>(
  'react-native-keyboard-controller/lib/commonjs/components/KeyboardChatScrollView/useExtraContentPadding/index.js',
);

describe('Android chat keyboard final range', () => {
  let options: Options;
  // Reanimated 4.7 UI refs expose the attached view on `value`; scrolls need one.
  const ref = { value: {} };

  beforeEach(() => {
    mockScrollTo.mockClear();
    mockScrollState = {
      offset: { value: 900 },
      layout: { value: { height: 600 } },
      size: { value: { height: 1_400 } },
    };
    options = {
      inverted: false,
      keyboardLiftBehavior: 'never',
      freeze: { value: false },
      offset: 0,
      blankSpace: { value: 0 },
      extraContentPadding: { value: 0 },
    };
  });

  function closeWithoutFinalMove() {
    const keyboard = createKeyboardHarness(ref, options);
    mockHandlers.onStart({ height: 300, duration: 200 });
    mockHandlers.onEnd({ height: 300, duration: 200 });
    mockHandlers.onStart({ height: 0, duration: 200 });
    // The last onMove still permits offset 900; only onEnd reports height 0.
    mockHandlers.onMove({ height: 100, duration: 200 });
    mockScrollTo.mockClear();
    mockHandlers.onEnd({ height: 0, duration: 200 });
    return keyboard;
  }

  test.each(['never', 'persistent'] as const)(
    'clamps a stale closing offset in %s mode',
    (mode) => {
      options.keyboardLiftBehavior = mode;
      const keyboard = closeWithoutFinalMove();
      expect(keyboard.padding.value).toBe(0);
      expect(mockScrollTo).toHaveBeenCalledWith(ref, 0, 800, false);
    },
  );

  test('preserves a valid reading position', () => {
    mockScrollState.offset.value = 450;
    closeWithoutFinalMove();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  test.each([
    { blank: 80, extra: 20, end: 880 },
    { blank: 20, extra: 60, end: 860 },
  ])('retains legitimate bottom space: $blank / $extra', ({ blank, extra, end }) => {
    options.blankSpace.value = blank;
    options.extraContentPadding.value = extra;
    closeWithoutFinalMove();
    expect(mockScrollTo).toHaveBeenCalledWith(ref, 0, end, false);
  });

  test('does not move a frozen list', () => {
    options.freeze.value = true;
    closeWithoutFinalMove();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  test.each([
    'src/components/KeyboardChatScrollView/useChatKeyboard/index.ts',
    'lib/module/components/KeyboardChatScrollView/useChatKeyboard/index.js',
  ])('keeps the final clamp in the Metro and ESM entry points: %s', (path) => {
    const source = readFileSync(
      `${process.cwd()}/node_modules/react-native-keyboard-controller/${path}`,
      'utf8',
    );
    const endHandler = source.split('onEnd:')[1];
    expect(endHandler).toContain('if (!inverted && closing.value)');
    expect(endHandler).toMatch(
      /clampScrollIfNeeded\(\s*effective,\s*Math.max\(blankSpace.value, effective \+ extraContentPadding.value\)/,
    );
  });
});

describe('Android keyboard with a growing composer', () => {
  const ref = { value: {} };
  let options: Options;

  beforeEach(() => {
    // The native view applies each command at once; only the hooks' own bookkeeping is under test.
    mockScrollTo.mockReset().mockImplementation((_ref: object, _x: number, y: number) => {
      mockScrollState.offset.value = y;
    });
    jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
    // Content 1,400 in a 600 viewport, resting at its end above a 100 compact composer.
    mockScrollState = {
      offset: { value: 900 },
      layout: { value: { height: 600 } },
      size: { value: { height: 1_400 } },
    };
    options = {
      inverted: false,
      keyboardLiftBehavior: 'persistent',
      freeze: { value: false },
      offset: 0,
      blankSpace: { value: 0 },
      extraContentPadding: { value: 100 },
    };
  });

  afterEach(() => jest.restoreAllMocks());

  function mountList() {
    const keyboard = createKeyboardHarness(ref, options);
    createInsetHarness({
      scrollViewRef: ref,
      extraContentPadding: options.extraContentPadding,
      keyboardPadding: keyboard.padding,
      keyboardPinnedToEnd: keyboard.pinnedToEnd,
      blankSpace: options.blankSpace,
      scroll: mockScrollState.offset,
      layout: mockScrollState.layout,
      size: mockScrollState.size,
      contentOffsetY: undefined,
      inverted: false,
      keyboardLiftBehavior: options.keyboardLiftBehavior,
      freeze: options.freeze,
    });
  }

  function growComposer(height: number) {
    const previous = options.extraContentPadding.value;
    options.extraContentPadding.value = height;
    mockInsetChanged(height, previous);
  }

  // Focus opens the keyboard while the composer morphs into its editing layout. A composer step
  // that lands after a keyboard frame is folded into the next one, so the list only moves forward.
  test.each(['keyboard first', 'composer first'] as const)(
    'keeps the end above the composer when both move in one frame (%s)',
    (order) => {
      mountList();
      mockHandlers.onStart({ height: 300, duration: 250 });
      const offsets: number[] = [];
      for (const [keyboard, composer] of [
        [60, 110],
        [120, 120],
        [180, 130],
        [240, 140],
        [300, 150],
      ]) {
        if (order === 'keyboard first') {
          mockHandlers.onMove({ height: keyboard, duration: 250 });
          growComposer(composer);
        } else {
          growComposer(composer);
          mockHandlers.onMove({ height: keyboard, duration: 250 });
          expect(mockScrollState.offset.value).toBe(800 + keyboard + composer);
        }
        offsets.push(mockScrollState.offset.value);
      }
      mockHandlers.onEnd({ height: 300, duration: 250 });
      offsets.push(mockScrollState.offset.value);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      expect(mockScrollState.offset.value).toBe(1_250);
    },
  );

  test('applies composer growth that lands after the last keyboard frame', () => {
    mountList();
    mockHandlers.onStart({ height: 300, duration: 250 });
    mockHandlers.onMove({ height: 300, duration: 250 });
    growComposer(150);
    mockHandlers.onEnd({ height: 300, duration: 250 });
    expect(mockScrollState.offset.value).toBe(1_250);
    growComposer(170);
    expect(mockScrollState.offset.value).toBe(1_270);
  });

  test('leaves a reader in place', () => {
    mockScrollState.offset.value = 300;
    options.keyboardLiftBehavior = 'never';
    mountList();
    mockHandlers.onStart({ height: 300, duration: 250 });
    mockHandlers.onMove({ height: 300, duration: 250 });
    growComposer(150);
    mockHandlers.onEnd({ height: 300, duration: 250 });
    expect(mockScrollState.offset.value).toBe(300);
  });

  test.each([
    ['src/components/KeyboardChatScrollView', 'index.tsx', 'useChatKeyboard/index.ts'],
    ['lib/module/components/KeyboardChatScrollView', 'index.js', 'useChatKeyboard/index.js'],
  ])('keeps the end pin in the Metro and ESM entry points: %s', (directory, view, keyboard) => {
    const read = (file: string) =>
      readFileSync(
        `${process.cwd()}/node_modules/react-native-keyboard-controller/${directory}/${file}`,
        'utf8',
      );
    expect(read(view)).toContain('keyboardPinnedToEnd: pinnedToEnd');
    expect(read(keyboard)).toMatch(/const target = pinnedToEnd\.value\s*\?/);
  });
});
