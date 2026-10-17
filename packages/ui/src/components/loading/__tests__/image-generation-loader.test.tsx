import { AppState, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ImageGenerationLoader } from '../image-generation-loader';

let mockReducedMotion = false;
const mockSetFrameActive = jest.fn();

jest.mock('uniwind', () => ({
  useCSSVariable: () => '#f5f5f5',
}));

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { Text: NativeText, View: NativeView } = jest.requireActual('react-native');

  const useShared = (initialValue: number) => {
    const ref = React.useRef(null) as {
      current: {
        get: () => number;
        set: (nextValue: number) => void;
        value: number;
      } | null;
    };
    ref.current ??= {
      get() {
        return this.value;
      },
      set(nextValue: number) {
        this.value = nextValue;
      },
      value: initialValue,
    };
    return ref.current;
  };

  return {
    __esModule: true,
    default: { Text: NativeText, View: NativeView },
    cancelAnimation: jest.fn(),
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ get: factory }),
    useFrameCallback: () => {
      const ref = React.useRef(null) as {
        current: { setActive: (active: boolean) => void } | null;
      };
      ref.current ??= { setActive: (active) => mockSetFrameActive(active) };
      return ref.current;
    },
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: useShared,
    withRepeat: (animation: unknown) => animation,
    withTiming: (value: unknown) => value,
  };
});

describe('ImageGenerationLoader', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockReducedMotion = false;
    mockSetFrameActive.mockClear();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('renders the default image generation state', () => {
    act(() => {
      renderer = create(<ImageGenerationLoader testID="loader" />);
    });

    const root = findHostRoot(renderer!);

    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityState).toEqual({ busy: true });
    expect(root.props.accessibilityLabel).toBe('Generating image');
    // The card is purely visual; status lives in the accessibility label.
    expect(renderer!.root.findAllByType(Text)).toHaveLength(0);
    expect(mockSetFrameActive).toHaveBeenLastCalledWith(true);
  });

  it('accepts product copy and a custom preview size', () => {
    act(() => {
      renderer = create(
        <ImageGenerationLoader
          accessibilityLabel="Rendering cover image"
          active={false}
          size={160}
          testID="loader"
        />,
      );
    });

    const root = findHostRoot(renderer!);

    expect(root.props.accessibilityLabel).toBe('Rendering cover image');
    expect(root.props.accessibilityState).toEqual({ busy: false });
    expect(StyleSheet.flatten(findPreview(renderer!)?.props.style)).toMatchObject({
      height: 160,
      width: 160,
    });
    expect(mockSetFrameActive).toHaveBeenLastCalledWith(false);
  });

  it('parks the UI-thread clock when Reduce Motion is enabled', () => {
    mockReducedMotion = true;

    act(() => {
      renderer = create(<ImageGenerationLoader testID="loader" />);
    });

    expect(findHostRoot(renderer!).props.accessibilityState).toEqual({ busy: true });
    expect(mockSetFrameActive).toHaveBeenLastCalledWith(false);
  });

  it('leaves the host to own the accessibility target when asked', () => {
    act(() => {
      renderer = create(<ImageGenerationLoader accessible={false} testID="loader" />);
    });

    expect(findHostRoot(renderer!).props.accessible).toBe(false);
  });

  it('renders the foil surface at a requested non-square image size', () => {
    act(() => {
      renderer = create(<ImageGenerationLoader height={224} testID="loader" width={128} />);
    });

    expect(StyleSheet.flatten(findPreview(renderer!)?.props.style)).toMatchObject({
      height: 224,
      width: 128,
    });
  });
});

function findHostRoot(tree: ReactTestRenderer) {
  const matches = tree.root.findAllByProps({ testID: 'loader' });
  return matches[matches.length - 1]!;
}

function findPreview(tree: ReactTestRenderer) {
  return tree.root.findAllByType(View).find((node) => node.props.pointerEvents === 'none');
}
