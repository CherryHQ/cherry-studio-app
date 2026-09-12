import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TextAnimation } from '../text-animation';

let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithTiming = jest.fn((value: number, _config?: unknown) => value);

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');

  const useSharedValue = (initialValue: number) => {
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
    cancelAnimation: (value: unknown) => mockCancelAnimation(value),
    default: { View: NativeView },
    Easing: {
      bezier: () => 'settle',
      linear: 'linear',
    },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
    useSharedValue,
    withTiming: (value: number, config?: unknown) => mockWithTiming(value, config),
  };
});

function activePhrase(renderer: ReactTestRenderer) {
  return renderer.root.findAllByProps({ importantForAccessibility: 'auto' })[0].findByType(Text)
    .props.children;
}

describe('TextAnimation.Rotating', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = false;
    mockCancelAnimation.mockClear();
    mockWithTiming.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('inherits timing from the compound root and cycles after delay plus duration', () => {
    act(() => {
      renderer = create(
        <TextAnimation delay={200} duration={1000} testID="root">
          <TextAnimation.Rotating text={['Focused', 'Fluid', 'Yours']} />
        </TextAnimation>,
      );
    });

    expect(
      renderer!.root.findAllByProps({ testID: 'root' }).some((node) => node.type === View),
    ).toBe(true);
    expect(activePhrase(renderer!)).toBe('Focused');

    act(() => jest.advanceTimersByTime(1199));
    expect(activePhrase(renderer!)).toBe('Focused');

    act(() => jest.advanceTimersByTime(1));
    expect(activePhrase(renderer!)).toBe('Fluid');

    act(() => jest.advanceTimersByTime(1000));
    expect(activePhrase(renderer!)).toBe('Yours');
  });

  it('lets variant settings override the root defaults', () => {
    act(() => {
      renderer = create(
        <TextAnimation delay={5000} duration={5000}>
          <TextAnimation.Rotating delay={100} duration={400} text={['One', 'Two']} />
        </TextAnimation>,
      );
    });

    act(() => jest.advanceTimersByTime(499));
    expect(activePhrase(renderer!)).toBe('One');

    act(() => jest.advanceTimersByTime(1));
    expect(activePhrase(renderer!)).toBe('Two');
  });

  it('reserves space for every phrase while hiding measurements and inactive text', () => {
    act(() => {
      renderer = create(
        <TextAnimation.Rotating
          className="max-w-80"
          numberOfLines={1}
          text={['Short', 'The longest phrase']}
          textClassName="text-xl text-primary"
        />,
      );
    });

    const sizer = renderer!.root.findByProps({ pointerEvents: 'none' });
    const measuredPhrases = sizer.findAllByType(Text);
    const inactiveLayer = renderer!.root.findAllByProps({
      importantForAccessibility: 'no-hide-descendants',
    })[1];

    expect(sizer.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      style: { height: 0 },
    });
    expect(measuredPhrases.map((node) => node.props.children)).toEqual([
      'Short',
      'The longest phrase',
    ]);
    expect(measuredPhrases[0].props).toMatchObject({
      className: 'opacity-0 text-xl text-primary',
      numberOfLines: 1,
    });
    expect(inactiveLayer.props.accessibilityElementsHidden).toBe(true);
    expect(renderer!.root.findByProps({ className: 'overflow-hidden max-w-80' })).toBeDefined();
  });

  it.each([
    ['disabled', false, false],
    ['Reduce Motion', true, true],
  ])('keeps the first phrase still when %s', (_case, enabled, reducedMotion) => {
    mockReducedMotion = reducedMotion;

    act(() => {
      renderer = create(
        <TextAnimation.Rotating enabled={enabled} duration={100} text={['One', 'Two']} />,
      );
    });

    act(() => jest.advanceTimersByTime(1000));
    expect(activePhrase(renderer!)).toBe('One');
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it('keeps a valid active phrase when the list shrinks', () => {
    act(() => {
      renderer = create(<TextAnimation.Rotating duration={100} text={['One', 'Two', 'Three']} />);
    });
    act(() => jest.advanceTimersByTime(200));
    expect(activePhrase(renderer!)).toBe('Three');

    act(() => {
      renderer!.update(<TextAnimation.Rotating duration={100} text={['Only']} />);
    });
    expect(activePhrase(renderer!)).toBe('Only');
  });

  it('rotates between changing string values and removes the previous value afterward', () => {
    act(() => {
      renderer = create(<TextAnimation.Rotating testID="status" text="Working" />);
    });

    act(() => {
      renderer!.update(<TextAnimation.Rotating testID="status" text="Complete" />);
    });

    expect(activePhrase(renderer!)).toBe('Complete');
    expect(
      renderer!.root
        .findByProps({ pointerEvents: 'none' })
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(['Working', 'Complete']);
    expect(
      renderer!.root.findAllByProps({ testID: 'status' }).filter((node) => node.type === View),
    ).toHaveLength(1);

    act(() => jest.advanceTimersByTime(250));

    expect(
      renderer!.root
        .findByProps({ pointerEvents: 'none' })
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(['Complete']);
  });

  it('updates a changing string immediately with Reduce Motion enabled', () => {
    mockReducedMotion = true;

    act(() => {
      renderer = create(<TextAnimation.Rotating text="Before" />);
    });
    act(() => {
      renderer!.update(<TextAnimation.Rotating text="After" />);
    });

    expect(activePhrase(renderer!)).toBe('After');
    expect(
      renderer!.root
        .findByProps({ pointerEvents: 'none' })
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(['After']);
  });

  it('animates from an empty string value', () => {
    act(() => {
      renderer = create(<TextAnimation.Rotating text="" />);
    });
    act(() => {
      renderer!.update(<TextAnimation.Rotating text="Ready" />);
    });

    expect(activePhrase(renderer!)).toBe('Ready');
    expect(
      renderer!.root
        .findByProps({ pointerEvents: 'none' })
        .findAllByType(Text)
        .map((node) => node.props.children),
    ).toEqual(['', 'Ready']);
  });
});
