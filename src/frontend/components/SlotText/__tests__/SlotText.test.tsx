import { Animated, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SlotText } from '../SlotText';

/** Echoed back by the mock below, so the highlight assertion has a name for it. */
const highlightColor = 'resolved--color-primary';

jest.mock('uniwind', () => ({
  useCSSVariable: (names: string[]) => names.map((name) => `resolved${name}`),
}));

const mockCancelAnimation = jest.fn();
const mockWithTiming = jest.fn(
  (value: unknown, _config?: unknown, _callback?: (finished?: boolean) => void) => value,
);
let mockReducedMotion = false;

const mockCompositeAnimation = {
  _isUsingNativeDriver: () => false,
  _startNativeLoop: jest.fn(),
  reset: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

jest.spyOn(Animated, 'timing').mockImplementation(() => mockCompositeAnimation);
jest.spyOn(Animated, 'parallel').mockImplementation(() => mockCompositeAnimation);

jest.mock('react-native-reanimated', () => {
  const { View: NativeView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: NativeView },
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    Easing: {
      bezier: jest.fn(() => (value: number) => value),
      linear: (value: number) => value,
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initialValue: unknown) => {
      const shared = {
        value: initialValue,
        get: () => shared.value,
        set: (nextValue: unknown) => {
          shared.value = nextValue;
        },
      };
      return shared;
    },
    withDelay: (_delayMs: number, animation: unknown) => animation,
    withTiming: (value: unknown, config?: unknown, callback?: (finished?: boolean) => void) =>
      mockWithTiming(value, config, callback),
  };
});

describe('SlotText', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCancelAnimation.mockClear();
    mockWithTiming.mockClear();
    mockReducedMotion = false;
  });

  afterEach(() => {
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('renders grapheme slots without animating the initial value', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText testID="slot-text" text="A😀" />);
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }

    fireTextLayouts(renderer);

    const root = findHostViewByTestId(renderer, 'slot-text');
    expect(root.props.accessibilityLabel).toBe('A😀');
    expect(root.props.accessibilityRole).toBe('text');
    expect(findInternalSlots(renderer)).toHaveLength(2);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  test('keeps only the latest requested value during rapid updates', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="A" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="B" />);
    });
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="C" />);
    });

    const internalText = findInternalText(createdRenderer);
    expect(internalText).toContain('B');
    expect(internalText).toContain('C');
    expect(internalText).not.toContain('A');
  });

  test('does not roll unchanged graphemes by default', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="Copy" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="Copied" />);
    });
    fireTextLayouts(createdRenderer);

    const slots = findInternalSlots(createdRenderer);
    const unchangedFirstSlotText = slots[0]
      .findAllByType(Text)
      .flatMap((node) => findTextChildren(node));
    expect(unchangedFirstSlotText.filter((value) => value === 'C')).toHaveLength(1);
  });

  test('rolls a coincidentally matching grapheme when its slot offset moves', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="In progress" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="Complete" />);
    });
    fireTextLayouts(createdRenderer);

    // Index 3 is "p" in both texts, but "In " and "Com" have different widths,
    // so a static "p" would drift sideways while surrounding slots resize.
    // An animated slot renders outgoing, incoming, and highlight faces.
    const slotTexts = findInternalSlots(createdRenderer)[3]
      .findAllByType(Text)
      .flatMap((node) => findTextChildren(node));
    expect(slotTexts.filter((value) => value === 'p')).toHaveLength(3);
  });

  test('grows and shrinks the positional slot set', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="Hi" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="Hello" />);
    });
    fireTextLayouts(createdRenderer);
    expect(findInternalSlots(createdRenderer)).toHaveLength(5);

    act(() => {
      createdRenderer.update(<SlotText text="Yo" />);
    });
    fireTextLayouts(createdRenderer);
    expect(findInternalSlots(createdRenderer)).toHaveLength(5);
  });

  test('cleans up outgoing faces and removed slots after the transition', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="Long" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="Go" />);
    });
    fireTextLayouts(createdRenderer);
    expect(findInternalSlots(createdRenderer)).toHaveLength(4);
    expect(findInternalText(createdRenderer)).toContain('L');

    act(() => jest.runOnlyPendingTimers());

    expect(findInternalSlots(createdRenderer)).toHaveLength(2);
    expect(findInternalText(createdRenderer)).not.toContain('L');
    expect(findInternalText(createdRenderer)).toEqual(expect.arrayContaining(['G', 'o']));
  });

  test('expands a new slot to its independently measured glyph width', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText text="A" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);
    mockWithTiming.mockClear();

    act(() => {
      createdRenderer.update(<SlotText text="AW" />);
    });
    fireTextLayouts(createdRenderer);

    expect(findInternalSlots(createdRenderer)).toHaveLength(2);
    expect(mockWithTiming).toHaveBeenCalledWith(
      24,
      expect.objectContaining({ duration: expect.any(Number) }),
      undefined,
    );
  });

  test('supports an empty initial value without creating slots', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText testID="slot-text" text="" />);
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }

    expect(findHostViewByTestId(renderer, 'slot-text').props.accessibilityLabel).toBe('');
    expect(findInternalSlots(renderer)).toHaveLength(0);
  });

  test('tints incoming glyphs with the fixed brand highlight', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<SlotText text="Go" />);
    });
    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    act(() => {
      createdRenderer.update(<SlotText text="Hi" />);
    });
    fireTextLayouts(createdRenderer);

    const highlighted = createdRenderer.root
      .findAllByType(Text)
      .filter((node) => StyleSheet.flatten(node.props.style)?.color === highlightColor);
    expect(highlighted).toHaveLength(2);
  });

  test('renders one static Text node when reduced motion is enabled', () => {
    mockReducedMotion = true;
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText testID="slot-text" text="Static" />);
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }

    const root = findHostViewByTestId(renderer, 'slot-text');
    expect(root.findByType(Text).props.children).toBe('Static');
    expect(findInternalSlots(renderer)).toHaveLength(0);
  });

  test('falls back and warns when text exceeds the grapheme limit', () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText maxGraphemes={3} testID="slot-text" text="Long" />);
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    expect(findHostViewByTestId(renderer, 'slot-text').findByType(Text).props.children).toBe(
      'Long',
    );
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('received 4 graphemes'));
    warning.mockRestore();
  });

  test('falls back without scheduling animation for invalid options', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<SlotText durationMs={-1} testID="slot-text" text="Invalid" />);
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    expect(findHostViewByTestId(renderer, 'slot-text').findByType(Text).props.children).toBe(
      'Invalid',
    );
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  test('hides every animation node from accessibility and cancels on unmount', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        <SlotText accessibilityLabel="Current status" testID="slot-text" text="Ready" />,
      );
    });

    if (!renderer) {
      throw new Error('SlotText test renderer was not created.');
    }
    const createdRenderer = renderer;
    fireTextLayouts(createdRenderer);

    const root = findHostViewByTestId(createdRenderer, 'slot-text');
    expect(root.props.accessible).toBe(true);
    expect(root.props.accessibilityLabel).toBe('Current status');
    expect(
      findInternalSlots(createdRenderer).every((slot) => slot.props.accessible === false),
    ).toBe(true);
    expect(
      createdRenderer.root
        .findAllByType(Text)
        .every((textNode) => textNode.props.accessible === false),
    ).toBe(true);

    act(() => createdRenderer.unmount());
    expect(mockCancelAnimation).toHaveBeenCalled();
  });
});

function findInternalSlots(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(View)
    .filter((view) => view.props.importantForAccessibility === 'no-hide-descendants');
}

function findInternalText(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) => findTextChildren(node))
    .filter((value) => value !== '\u00A0');
}

function findTextChildren(node: { props: { children?: unknown } }): string[] {
  const { children } = node.props;
  if (typeof children === 'string') {
    return [children];
  }
  if (Array.isArray(children)) {
    return children.filter((child): child is string => typeof child === 'string');
  }
  return [];
}

const MOCK_GLYPH_WIDTHS: Record<string, number> = {
  ' ': 6,
  '\u00A0': 6,
  C: 16,
  I: 6,
  m: 20,
  W: 24,
};

function fireTextLayouts(renderer: ReactTestRenderer) {
  act(() => {
    renderer.root.findAllByType(Text).forEach((node) => {
      if (typeof node.props.onLayout !== 'function') {
        return;
      }

      const text = findTextChildren(node).join('');
      const width = MOCK_GLYPH_WIDTHS[text] ?? Math.max(8, Array.from(text).length * 8);
      node.props.onLayout({
        nativeEvent: {
          layout: { height: 20, width },
        },
      });
    });
  });
}

function findHostViewByTestId(renderer: ReactTestRenderer, testID: string) {
  const node = renderer.root.findAllByType(View).find((view) => view.props.testID === testID);
  if (!node) {
    throw new Error(`Could not find View with testID ${testID}.`);
  }
  return node;
}
