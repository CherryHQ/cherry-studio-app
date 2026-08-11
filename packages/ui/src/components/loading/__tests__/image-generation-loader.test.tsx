import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ImageGenerationLoader } from '../image-generation-loader';

let mockReducedMotion = false;
const mockSetFrameActive = jest.fn();

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#777777', '#111111'],
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
  };
});

describe('ImageGenerationLoader', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockReducedMotion = false;
    mockSetFrameActive.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders the default image generation state', () => {
    act(() => {
      renderer = create(<ImageGenerationLoader testID="loader" />);
    });

    const root = findHostRoot(renderer!);
    const text = collectText(renderer!);

    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityState).toEqual({ busy: true });
    expect(root.props.accessibilityLabel).toBe(
      'Generating image: a calm mountain lake at dawn. 1024 \u00d7 1024',
    );
    expect(text).toContain('Generating image');
    expect(text).toContain('\u201ca calm mountain lake at dawn\u201d');
    expect(text).toContain('1024 \u00d7 1024');
    expect(mockSetFrameActive).toHaveBeenLastCalledWith(true);
  });

  it('accepts product copy and a custom preview size', () => {
    act(() => {
      renderer = create(
        <ImageGenerationLoader
          accessibilityLabel="Rendering cover image"
          active={false}
          label="Rendering"
          prompt="mist over a cedar forest"
          resolution={'1536 \u00d7 1024'}
          size={160}
          testID="loader"
        />,
      );
    });

    const root = findHostRoot(renderer!);
    const preview = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.pointerEvents === 'none');
    const resolutionBadge = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.className?.includes('absolute right-2 top-2'));

    expect(root.props.accessibilityLabel).toBe('Rendering cover image');
    expect(root.props.accessibilityState).toEqual({ busy: false });
    expect(preview?.props.className).toContain('border border-border');
    expect(preview?.props.className).toContain('bg-card');
    expect(resolutionBadge?.props.className).toContain('border border-border');
    expect(StyleSheet.flatten(preview?.props.style)).toMatchObject({ height: 160, width: 160 });
    expect(collectText(renderer!)).toEqual(
      expect.arrayContaining([
        'Rendering',
        '\u201cmist over a cedar forest\u201d',
        '1536 \u00d7 1024',
      ]),
    );
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

  it('renders a canvas-only thumbnail without a second accessibility target', () => {
    act(() => {
      renderer = create(
        <ImageGenerationLoader
          presentation="thumbnail"
          prompt="mist over a cedar forest"
          resolution={'1536 \u00d7 1024'}
          size={96}
          testID="loader"
        />,
      );
    });

    const root = findHostRoot(renderer!);
    const preview = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.pointerEvents === 'none');

    expect(root.props.accessible).toBe(false);
    expect(StyleSheet.flatten(preview?.props.style)).toMatchObject({ height: 96, width: 96 });
    expect(collectText(renderer!)).toEqual([]);
  });

  it('renders the dot field at a requested non-square image size', () => {
    act(() => {
      renderer = create(<ImageGenerationLoader height={224} testID="loader" width={128} />);
    });

    const preview = renderer!.root
      .findAllByType(View)
      .find((node) => node.props.pointerEvents === 'none');

    expect(StyleSheet.flatten(preview?.props.style)).toMatchObject({ height: 224, width: 128 });
  });
});

function findHostRoot(tree: ReactTestRenderer) {
  const matches = tree.root.findAllByProps({ testID: 'loader' });
  return matches[matches.length - 1]!;
}

function collectText(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => flattenText(node.props.children));
}

function flattenText(value: unknown): string {
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return '';
}
