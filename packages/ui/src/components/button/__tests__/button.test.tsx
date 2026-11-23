import { createRef } from 'react';
import { AccessibilityInfo, Platform, Text, View, type ViewInstance } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResolveClassNames } from 'uniwind';

import { pressMotion } from '../../../motion';
import { MenuInteraction } from '../../menu/menu-interaction';
import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '../button';

let mockNativePressed = false;
const nativeMenuInteraction = {
  isOpen: true,
  close: () => undefined,
  shouldUseNativePresses: true,
};

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual('react');
  return {
    Pressable: function GesturePressable({
      children,
      ...props
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) {
      return React.createElement(
        'GesturePressable',
        props,
        typeof children === 'function' ? children({ pressed: mockNativePressed }) : children,
      );
    },
  };
});

const mockWithTiming = jest.fn((value: number, _config?: unknown) => value);
const mockWithSpring = jest.fn((value: number, _config?: unknown) => value);
const mockSharedValueSet = jest.fn();
let latestSharedValue: { get: () => number; set: (nextValue: number) => void } | undefined;
const mockSelectionAsync = jest.fn(async () => undefined);
const mockImpactAsync = jest.fn(async (_style?: unknown) => undefined);
const mockNotificationAsync = jest.fn(async (_type?: unknown) => undefined);

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Error: 'error',
    Success: 'success',
    Warning: 'warning',
  },
  impactAsync: (style: unknown) => mockImpactAsync(style),
  notificationAsync: (type: unknown) => mockNotificationAsync(type),
  selectionAsync: () => mockSelectionAsync(),
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
        mockSharedValueSet(nextValue);
        this.value = nextValue;
      },
      value: initialValue,
    };
    latestSharedValue = ref.current;
    return ref.current;
  };

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(NativeView, props, children),
    },
    Easing: {
      bezier: () => 'bezier',
      linear: 'linear',
    },
    ReduceMotion: { Never: 'never' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue,
    withSpring: (value: number, config?: unknown) => mockWithSpring(value, config),
    withTiming: (value: number, config?: unknown) => mockWithTiming(value, config),
  };
});

jest.mock('../../loading/spinner', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  function Spinner(props: object) {
    return React.createElement(View, { ...props, testID: 'spinner' });
  }

  return { Spinner };
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn(() => ({ color: '#ffffff' })),
}));

describe('Button', () => {
  const originalOs = Platform.OS;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    Platform.OS = 'ios';
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    latestSharedValue = undefined;
    mockSharedValueSet.mockClear();
    mockWithTiming.mockClear();
    mockWithSpring.mockClear();
    mockSelectionAsync.mockClear();
    mockImpactAsync.mockClear();
    mockNotificationAsync.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });

  function render(
    children: ButtonProps['children'] = 'Continue',
    props: Partial<ButtonProps> = {},
  ) {
    act(() => {
      const element = <Button {...props}>{children}</Button>;
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });

    if (!renderer) {
      throw new Error('Button renderer was not created.');
    }

    return renderer;
  }

  function findPressable(tree: ReactTestRenderer) {
    const pressable = tree.root.findAll((node) => node.props.accessibilityRole === 'button')[0];

    if (!pressable) {
      throw new Error('Pressable was not rendered.');
    }

    return pressable;
  }

  function findSurface(tree: ReactTestRenderer) {
    const pressable = findPressable(tree);
    const surface = pressable.findAll(
      (node) =>
        typeof node.props.className === 'string' && node.props.className.includes('flex-row'),
    )[0];

    if (!surface) {
      throw new Error('Button surface was not rendered.');
    }

    return surface;
  }

  test('renders the default button with outer Pressable, inner surface, and label', () => {
    const tree = render('Continue');
    const pressable = findPressable(tree);
    const surface = findSurface(tree);
    const label = tree.root.findByType(Text);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.className).toBe('active:opacity-80 disabled:opacity-40');
    expect(surface.props.className).toEqual(expect.stringContaining('bg-foreground shadow-xs'));
    const surfaceClassNames = surface.props.className.split(' ');
    expect(surfaceClassNames).toEqual(
      expect.arrayContaining(['gap-2', 'px-4', 'py-2.5', 'rounded-xl']),
    );
    expect(surfaceClassNames).not.toContain('h-10');
    expect(label.props.children).toBe('Continue');
    expect(label.props.className).toEqual(expect.stringContaining('text-background'));
    expect(label.props.className.split(' ')).toEqual(
      expect.arrayContaining(['min-w-0', 'shrink', 'text-base']),
    );
  });

  test('supports React 19 ref prop on the outermost Pressable', () => {
    const ref = createRef<ViewInstance>();
    render('Continue', { ref });

    expect(ref.current).not.toBeNull();
  });

  test('supports composed content through Button.Label', () => {
    const tree = render(
      <>
        <View testID="icon" />
        <Button.Label>Insert</Button.Label>
      </>,
      { size: 'lg', variant: 'outline' },
    );
    const label = tree.root.findByType(Text);

    expect(tree.root.findByProps({ testID: 'icon' })).toBeDefined();
    expect(label.props.className).toEqual(expect.stringContaining('text-foreground'));
    expect(label.props.className).toEqual(expect.stringContaining('text-lg'));
  });

  test.each<{
    iconClassName: string;
    labelClassName: string;
    rootClassNames: string[];
    size: ButtonSize;
  }>([
    {
      iconClassName: 'size-4',
      labelClassName: 'text-sm',
      rootClassNames: ['gap-1', 'px-0', 'py-1'],
      size: 'inline',
    },
    {
      iconClassName: 'size-4',
      labelClassName: 'text-sm',
      rootClassNames: ['gap-1', 'px-2', 'py-1.5'],
      size: 'xs',
    },
    {
      iconClassName: 'size-4',
      labelClassName: 'text-sm',
      rootClassNames: ['gap-1.5', 'px-3', 'py-2'],
      size: 'sm',
    },
    {
      iconClassName: 'size-5',
      labelClassName: 'text-base',
      rootClassNames: ['gap-2', 'px-4', 'py-2.5'],
      size: 'default',
    },
    {
      iconClassName: 'size-5',
      labelClassName: 'text-base',
      rootClassNames: ['min-h-10', 'gap-2', 'px-4', 'py-2'],
      size: 'field',
    },
    {
      iconClassName: 'size-6',
      labelClassName: 'text-lg',
      rootClassNames: ['gap-2.5', 'px-5', 'py-3'],
      size: 'lg',
    },
  ])('renders the $size size', ({ iconClassName, labelClassName, rootClassNames, size }) => {
    const tree = render('Add', { icon: <View testID="icon" />, size });
    const surfaceClassName = findSurface(tree).props.className as string;
    const labelClassNameValue = tree.root.findByType(Text).props.className as string;
    const iconClassNameValue = tree.root.findByProps({ testID: 'icon' }).props.className as string;

    expect(surfaceClassName.split(' ')).toEqual(expect.arrayContaining(rootClassNames));
    expect(labelClassNameValue.split(' ')).toContain(labelClassName);
    expect(iconClassNameValue.split(' ')).toContain(iconClassName);
  });

  test('renders an icon with the label using the variant color', () => {
    const tree = render('Add', {
      icon: <View className="size-6 text-destructive" testID="icon" />,
      variant: 'outline',
    });
    const icon = tree.root.findByProps({ testID: 'icon' });
    const label = tree.root.findByType(Text);

    expect(label.props.children).toBe('Add');
    expect(icon.props.className.split(' ')).toEqual(
      expect.arrayContaining(['size-6', 'text-destructive']),
    );
    expect(icon.props.className).not.toContain('size-5');
    expect(icon.props.className).not.toContain('text-foreground');
  });

  test('keeps the xs hitSlop directly on the outermost host view so parents cannot clip it', () => {
    const tree = render(null, {
      accessibilityLabel: 'More',
      icon: <View testID="icon" />,
      size: 'xs',
    });
    const pressable = findPressable(tree);

    expect(pressable.parent).toBe(tree.root.findByType(Button));
    expect(pressable.props.hitSlop).toBe(8);
  });

  test('uses content-driven square padding for an icon-only button', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
    });
    const pressable = findPressable(tree);
    const surfaceClassNames = findSurface(tree).props.className.split(' ');
    const iconClassNames = tree.root.findByProps({ testID: 'icon' }).props.className.split(' ');

    expect(pressable.props.accessibilityLabel).toBe('Add');
    expect(surfaceClassNames).toContain('p-2.5');
    expect(surfaceClassNames).not.toContain('px-4');
    expect(surfaceClassNames).not.toContain('py-2.5');
    expect(surfaceClassNames).not.toContain('h-10');
    expect(surfaceClassNames).not.toContain('w-10');
    expect(iconClassNames).toEqual(expect.arrayContaining(['size-5', 'text-background']));
  });

  test('applies large icon-only padding without fixed dimensions', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
      size: 'lg',
    });
    const surfaceClassNames = findSurface(tree).props.className.split(' ');

    expect(surfaceClassNames).toContain('p-3');
    expect(surfaceClassNames).not.toContain('px-5');
    expect(surfaceClassNames).not.toContain('py-3');
    expect(surfaceClassNames).not.toContain('h-12');
    expect(surfaceClassNames).not.toContain('w-12');
  });

  test.each<{
    labelClassName: string;
    pressableClassNames?: string[];
    surfaceClassNames: string[];
    variant: ButtonVariant;
  }>([
    {
      labelClassName: 'text-destructive-foreground',
      surfaceClassNames: ['bg-destructive', 'shadow-xs'],
      variant: 'destructive',
    },
    {
      labelClassName: 'text-foreground',
      surfaceClassNames: ['bg-transparent', 'shadow-none'],
      variant: 'ghost',
    },
    {
      labelClassName: 'text-link',
      pressableClassNames: ['active:opacity-70'],
      surfaceClassNames: ['bg-transparent', 'shadow-none'],
      variant: 'link',
    },
    {
      labelClassName: 'text-foreground',
      surfaceClassNames: ['border', 'border-border', 'bg-transparent', 'shadow-none'],
      variant: 'outline',
    },
    {
      labelClassName: 'text-secondary-foreground',
      surfaceClassNames: ['border', 'border-border', 'bg-field', 'shadow-none'],
      variant: 'secondary',
    },
  ])(
    'renders the $variant variant',
    ({ labelClassName, pressableClassNames, surfaceClassNames, variant }) => {
      const tree = render('Continue', { variant });
      const pressableClassName = findPressable(tree).props.className as string;
      const surfaceClassName = findSurface(tree).props.className as string;
      const labelClassNameValue = tree.root.findByType(Text).props.className as string;

      if (pressableClassNames) {
        expect(pressableClassName.split(' ')).toEqual(expect.arrayContaining(pressableClassNames));
      }
      expect(surfaceClassName.split(' ')).toEqual(expect.arrayContaining(surfaceClassNames));
      expect(labelClassNameValue.split(' ')).toContain(labelClassName);
      expect(useResolveClassNames).toHaveBeenLastCalledWith(
        expect.stringContaining(labelClassName),
      );
    },
  );

  test('combines semantic shape, size, and variant axes', () => {
    const tree = render(<Button.Label>Details</Button.Label>, {
      shape: 'pill',
      size: 'inline',
      variant: 'link',
    });
    const surfaceClassName = findSurface(tree).props.className as string;
    const labelClassName = tree.root.findByType(Text).props.className as string;

    expect(surfaceClassName.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-transparent', 'gap-1', 'px-0', 'py-1']),
    );
    expect(surfaceClassName).not.toContain('px-4');
    expect(surfaceClassName).not.toContain('py-2.5');
    expect(surfaceClassName).not.toContain('rounded-xl');
    expect(labelClassName).toContain('text-link');
    expect(labelClassName).toContain('underline');
  });

  test('disables the Pressable and exposes busy state while loading', () => {
    const tree = render('Save', {
      accessibilityState: { selected: true },
      icon: <View testID="icon" />,
      loading: true,
    });
    const pressable = findPressable(tree);
    const spinner = tree.root.findByProps({ testID: 'spinner' });

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
      selected: true,
    });
    expect(useResolveClassNames).toHaveBeenCalledWith('text-background');
    expect(spinner.props.color).toBe('#ffffff');
    expect(spinner.props.size).toBe('sm');
    expect(spinner.props.importantForAccessibility).toBe('no');
    expect(tree.root.findAllByProps({ testID: 'icon' })).toHaveLength(0);
  });

  test('uses a medium spinner for a large button', () => {
    const tree = render('Save', { loading: true, size: 'lg' });

    expect(tree.root.findByProps({ testID: 'spinner' }).props.size).toBe('default');
  });

  test('explicitly clears busy state when loading finishes', () => {
    const tree = render('Save', { loading: true, accessibilityState: { selected: true } });

    act(() => {
      tree.update(<Button accessibilityState={{ selected: true }}>Save</Button>);
    });

    const pressable = findPressable(tree);
    expect(pressable.props.disabled).toBe(false);
    expect(pressable.props.accessibilityState).toEqual({ busy: false, selected: true });
    expect(tree.root.findAllByProps({ testID: 'spinner' })).toHaveLength(0);
  });

  test('merges disabled state with caller accessibility state', () => {
    const pressable = findPressable(
      render('Delete', {
        accessibilityState: { checked: true },
        disabled: true,
      }),
    );

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityState).toEqual({
      busy: false,
      checked: true,
      disabled: true,
    });
  });

  test('uses GesturePressable with native surface styles inside a native-press overlay', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
    mockNativePressed = false;
    try {
      const onPress = jest.fn();
      act(() => {
        renderer = create(
          <MenuInteraction.Provider value={nativeMenuInteraction}>
            <Button haptic="light" onPress={onPress} variant="ghost">
              Compact
            </Button>
          </MenuInteraction.Provider>,
        );
      });
      await act(async () => {});

      const gesture = renderer!.root.findByType('GesturePressable' as never);
      const view = gesture.findByType(View);
      const baseClasses = (view.props.className as string).split(' ');
      expect(baseClasses).not.toContain('active:opacity-80');
      expect(baseClasses).not.toContain('active:bg-secondary');
      expect(baseClasses).not.toContain('bg-secondary');
      expect(baseClasses).not.toContain('opacity-40');

      mockNativePressed = true;
      act(() => {
        renderer!.update(
          <MenuInteraction.Provider value={nativeMenuInteraction}>
            <Button haptic="light" onPress={onPress} variant="ghost">
              Compact
            </Button>
          </MenuInteraction.Provider>,
        );
      });
      expect((gesture.findByType(View).props.className as string).split(' ')).toEqual(
        expect.arrayContaining(['bg-secondary', 'opacity-80']),
      );

      act(() => gesture.props.onPressIn({ nativeEvent: {} }));
      expect(mockWithTiming).toHaveBeenCalledWith(pressMotion.scale, {
        ...pressMotion.pressIn,
        reduceMotion: 'never',
      });
      act(() => gesture.props.onPressOut({ nativeEvent: {} }));
      expect(mockWithSpring).toHaveBeenCalledWith(1, expect.objectContaining(pressMotion.pressOut));

      act(() => gesture.props.onPress({ nativeEvent: {} }));
      expect(mockImpactAsync).toHaveBeenCalledWith('light');
      expect(onPress).toHaveBeenCalledTimes(1);

      mockNativePressed = false;
      act(() => {
        renderer!.update(
          <MenuInteraction.Provider value={nativeMenuInteraction}>
            <Button disabled haptic="light" onPress={onPress} variant="ghost">
              Compact
            </Button>
          </MenuInteraction.Provider>,
        );
      });
      expect((gesture.findByType(View).props.className as string).split(' ')).toContain(
        'opacity-40',
      );
    } finally {
      mockNativePressed = false;
    }
  });

  test('scales down on press-in, springs back on release, and forwards caller callbacks', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const pressable = findPressable(
      render('Continue', {
        onPress,
        onPressIn,
        onPressOut,
      }),
    );

    await act(async () => {});
    act(() => pressable.props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledWith(pressMotion.scale, {
      ...pressMotion.pressIn,
      reduceMotion: 'never',
    });
    expect(onPressIn).toHaveBeenCalledTimes(1);

    act(() => pressable.props.onPressOut({}));
    expect(mockWithSpring).toHaveBeenCalledWith(1, expect.objectContaining(pressMotion.pressOut));
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  test('keeps trigger-only buttons free of press handlers and scaling for menu hosts', () => {
    const pressable = findPressable(render('More'));

    expect(pressable.props.onPress).toBeUndefined();
    expect(pressable.props.onPressIn).toBeUndefined();
    expect(pressable.props.onPressOut).toBeUndefined();
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  test.each(['link', 'text'] as const)(
    'does not animate press scale for inline %s variant',
    async (variant) => {
      jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
      const pressable = findPressable(render('Learn more', { onPress: jest.fn(), variant }));
      await act(async () => {});

      act(() => pressable.props.onPressIn({}));
      act(() => pressable.props.onPressOut({}));

      expect(mockWithTiming).not.toHaveBeenCalled();
      expect(mockWithSpring).not.toHaveBeenCalled();
    },
  );

  test('skips press scaling when Reduce Motion is enabled', async () => {
    const pressable = findPressable(render('Continue', { onPress: jest.fn() }));
    await act(async () => {});

    act(() => pressable.props.onPressIn({}));
    act(() => pressable.props.onPressOut({}));

    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  test('rests immediately on a live motion preference change and ignores an older native read', async () => {
    let resolveRead!: (enabled: boolean) => void;
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRead = resolve;
      }),
    );
    const motionEvents: {
      addEventListener(name: 'reduceMotionChanged', change: (enabled: boolean) => void): unknown;
    } = AccessibilityInfo;
    const subscribe = jest.spyOn(motionEvents, 'addEventListener').mockClear();
    const tree = render('Continue', { onPress: jest.fn() });
    const change = subscribe.mock.calls.find(([event]) => event === 'reduceMotionChanged')?.[1];
    if (!change) throw new Error('Missing system motion subscription');

    act(() => change(false));
    act(() => findPressable(tree).props.onPressIn({}));
    expect(latestSharedValue?.get()).toBe(pressMotion.scale);
    act(() => change(true));
    expect(latestSharedValue?.get()).toBe(1);
    await act(async () => resolveRead(false));
    act(() => findPressable(tree).props.onPressOut({}));
    act(() => findPressable(tree).props.onPressIn({}));
    expect(mockWithSpring).not.toHaveBeenCalled();
    expect(mockWithTiming).toHaveBeenCalledTimes(1);

    act(() => change(false));
    act(() => findPressable(tree).props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledTimes(2);
  });

  test('springs smoothly back to 1 when loading activates mid-press', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
    const onPress = jest.fn();
    const tree = render('Save', { onPress });
    const pressable = findPressable(tree);
    await act(async () => {});
    act(() => pressable.props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(
        <Button loading onPress={onPress}>
          Save
        </Button>,
      );
    });

    // Mid-press transition to loading springs softly back to 1 and disarms subsequent press-out.
    expect(mockWithSpring).toHaveBeenCalledTimes(1);
    expect(mockWithSpring).toHaveBeenCalledWith(1, expect.objectContaining(pressMotion.pressOut));
    expect(latestSharedValue?.get()).toBe(1);

    act(() => findPressable(tree).props.onPressOut({}));
    expect(mockWithSpring).toHaveBeenCalledTimes(1);

    act(() => findPressable(tree).props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
  });

  test('keeps haptics silent by default across all variants and fires only when opted in on commit', () => {
    for (const variant of [
      'default',
      'destructive',
      'outline',
      'secondary',
      'ghost',
      'tonal',
      'link',
      'text',
    ] as const) {
      const onQuietPress = jest.fn();
      const quietPressable = findPressable(render('Action', { onPress: onQuietPress, variant }));
      act(() => quietPressable.props.onPress({}));
      expect(onQuietPress).toHaveBeenCalledTimes(1);
    }
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockSelectionAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();

    const onOptInPress = jest.fn();
    const optInPressable = findPressable(
      render('Send', { haptic: 'light', onPress: onOptInPress }),
    );
    act(() => optInPressable.props.onPressIn({}));
    expect(mockImpactAsync).not.toHaveBeenCalled();

    act(() => optInPressable.props.onPress({}));
    expect(mockImpactAsync).toHaveBeenCalledWith('light');
    expect(onOptInPress).toHaveBeenCalledTimes(1);

    mockImpactAsync.mockClear();
    const onDestructive = jest.fn();
    const destructivePressable = findPressable(
      render('Delete', { haptic: 'medium', onPress: onDestructive, variant: 'destructive' }),
    );
    act(() => destructivePressable.props.onPress({}));
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    expect(onDestructive).toHaveBeenCalledTimes(1);
  });

  test('does not fire haptics when disabled, loading, or suppressed via haptic={false}', () => {
    const onDisabledPress = jest.fn();
    const disabledPressable = findPressable(
      render('Send', { disabled: true, haptic: 'light', onPress: onDisabledPress }),
    );
    act(() => disabledPressable.props.onPress({}));
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(onDisabledPress).not.toHaveBeenCalled();

    const onMuted = jest.fn();
    const muted = findPressable(render('Muted', { haptic: false, onPress: onMuted }));
    act(() => muted.props.onPress({}));
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(onMuted).toHaveBeenCalledTimes(1);
  });

  test('leaves outcome haptics to the operation even for an untyped caller', () => {
    const onPress = jest.fn();
    const tree = render('Copy', {
      // @ts-expect-error Outcome intents are outside the press contract.
      haptic: 'success',
      onPress,
    });
    act(() => findPressable(tree).props.onPress({}));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });
});
