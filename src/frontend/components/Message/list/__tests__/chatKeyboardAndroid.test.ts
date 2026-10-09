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
let mockScrollState: {
  offset: Cell<number>;
  layout: Cell<{ height: number }>;
  size: Cell<{ height: number }>;
};
const mockScrollTo = jest.fn();

jest.mock('react-native-reanimated', () => ({
  scrollTo: (...args: unknown[]) => mockScrollTo(...args),
  useSharedValue: <T>(value: T) => ({ value }),
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
  useChatKeyboard: (ref: object, options: Options) => { padding: Cell<number> };
}>(
  'react-native-keyboard-controller/lib/commonjs/components/KeyboardChatScrollView/useChatKeyboard/index.js',
);

describe('Android chat keyboard final range', () => {
  let options: Options;
  const ref = {};

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
