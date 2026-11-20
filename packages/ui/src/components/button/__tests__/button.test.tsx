import { Platform, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResolveClassNames } from 'uniwind';

import { pressMotion } from '../../../motion';
import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from '../button';

let mockReducedMotion = false;
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
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => mockReducedMotion,
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
    mockReducedMotion = false;
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
  });

  afterAll(() => {
    Platform.OS = originalOs;
  });

  function render(
    children: ButtonProps['children'] = 'Continue',
    props: Partial<ButtonProps> = {},
  ) {
    act(() => {
      renderer = create(<Button {...props}>{children}</Button>);
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

  test('renders the default button and wraps primitive children in a label', () => {
    const tree = render('Continue');
    const pressable = findPressable(tree);
    const label = tree.root.findByType(Text);

    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.className).toEqual(expect.stringContaining('bg-foreground shadow-xs'));
    const rootClassNames = pressable.props.className.split(' ');
    expect(rootClassNames).toEqual(
      expect.arrayContaining(['gap-2', 'px-4', 'py-2.5', 'rounded-xl']),
    );
    expect(rootClassNames).not.toContain('h-10');
    expect(label.props.children).toBe('Continue');
    expect(label.props.className).toEqual(expect.stringContaining('text-background'));
    expect(label.props.className.split(' ')).toEqual(
      expect.arrayContaining(['min-w-0', 'shrink', 'text-base']),
    );
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
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassNameValue = tree.root.findByType(Text).props.className as string;
    const iconClassNameValue = tree.root.findByProps({ testID: 'icon' }).props.className as string;

    expect(rootClassName.split(' ')).toEqual(expect.arrayContaining(rootClassNames));
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

  test('keeps the xs visual density inside a usable touch target', () => {
    const tree = render(null, {
      accessibilityLabel: 'More',
      icon: <View testID="icon" />,
      size: 'xs',
    });

    expect(findPressable(tree).props.hitSlop).toBe(8);
  });

  test('uses content-driven square padding for an icon-only button', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
    });
    const pressable = findPressable(tree);
    const rootClassNames = pressable.props.className.split(' ');
    const iconClassNames = tree.root.findByProps({ testID: 'icon' }).props.className.split(' ');

    expect(pressable.props.accessibilityLabel).toBe('Add');
    expect(rootClassNames).toContain('p-2.5');
    expect(rootClassNames).not.toContain('px-4');
    expect(rootClassNames).not.toContain('py-2.5');
    expect(rootClassNames).not.toContain('h-10');
    expect(rootClassNames).not.toContain('w-10');
    expect(iconClassNames).toEqual(expect.arrayContaining(['size-5', 'text-background']));
  });

  test('applies large icon-only padding without fixed dimensions', () => {
    const tree = render(null, {
      accessibilityLabel: 'Add',
      icon: <View testID="icon" />,
      size: 'lg',
    });
    const rootClassNames = findPressable(tree).props.className.split(' ');

    expect(rootClassNames).toContain('p-3');
    expect(rootClassNames).not.toContain('px-5');
    expect(rootClassNames).not.toContain('py-3');
    expect(rootClassNames).not.toContain('h-12');
    expect(rootClassNames).not.toContain('w-12');
  });

  test.each<{
    labelClassName: string;
    rootClassNames: string[];
    variant: ButtonVariant;
  }>([
    {
      labelClassName: 'text-destructive-foreground',
      rootClassNames: ['bg-destructive', 'shadow-xs'],
      variant: 'destructive',
    },
    {
      labelClassName: 'text-foreground',
      rootClassNames: ['bg-transparent', 'shadow-none'],
      variant: 'ghost',
    },
    {
      labelClassName: 'text-link',
      rootClassNames: ['bg-transparent', 'shadow-none', 'active:opacity-70'],
      variant: 'link',
    },
    {
      labelClassName: 'text-foreground',
      rootClassNames: ['border', 'border-border', 'bg-transparent', 'shadow-none'],
      variant: 'outline',
    },
    {
      labelClassName: 'text-secondary-foreground',
      rootClassNames: ['border', 'border-border', 'bg-field', 'shadow-none'],
      variant: 'secondary',
    },
  ])('renders the $variant variant', ({ labelClassName, rootClassNames, variant }) => {
    const tree = render('Continue', { variant });
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassNameValue = tree.root.findByType(Text).props.className as string;

    expect(rootClassName.split(' ')).toEqual(expect.arrayContaining(rootClassNames));
    expect(labelClassNameValue.split(' ')).toContain(labelClassName);
    expect(useResolveClassNames).toHaveBeenLastCalledWith(expect.stringContaining(labelClassName));
  });

  test('combines semantic shape, size, and variant axes', () => {
    const tree = render(<Button.Label>Details</Button.Label>, {
      shape: 'pill',
      size: 'inline',
      variant: 'link',
    });
    const rootClassName = findPressable(tree).props.className as string;
    const labelClassName = tree.root.findByType(Text).props.className as string;

    expect(rootClassName.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-transparent', 'gap-1', 'px-0', 'py-1']),
    );
    expect(rootClassName).not.toContain('px-4');
    expect(rootClassName).not.toContain('py-2.5');
    expect(rootClassName).not.toContain('rounded-xl');
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

  test('scales down on press-in, springs back on release, and forwards caller callbacks', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const pressable = findPressable(
      render('Continue', {
        onPressIn,
        onPressOut,
      }),
    );

    act(() => pressable.props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledWith(
      pressMotion.scale,
      expect.objectContaining({ duration: pressMotion.pressIn.duration }),
    );
    expect(onPressIn).toHaveBeenCalledTimes(1);

    act(() => pressable.props.onPressOut({}));
    expect(mockWithSpring).toHaveBeenCalledWith(1, expect.objectContaining(pressMotion.pressOut));
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  test.each(['link', 'text'] as const)(
    'does not animate press scale for inline %s variant',
    (variant) => {
      const pressable = findPressable(render('Learn more', { variant }));

      act(() => pressable.props.onPressIn({}));
      act(() => pressable.props.onPressOut({}));

      expect(mockWithTiming).not.toHaveBeenCalled();
      expect(mockWithSpring).not.toHaveBeenCalled();
    },
  );

  test('skips press scaling when Reduce Motion is enabled', () => {
    mockReducedMotion = true;
    const pressable = findPressable(render('Continue'));

    act(() => pressable.props.onPressIn({}));
    act(() => pressable.props.onPressOut({}));

    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  test('skips press scaling and resets mid-press when disabled or loading activates', () => {
    const tree = render('Save');
    const pressable = findPressable(tree);

    act(() => pressable.props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(<Button loading>Save</Button>);
    });

    // Updating loading mid-press clears active press state and resets the shared scale to 1.
    expect(mockSharedValueSet).toHaveBeenLastCalledWith(1);
    expect(latestSharedValue?.get()).toBe(1);
    act(() => findPressable(tree).props.onPressOut({}));
    expect(mockWithSpring).not.toHaveBeenCalled();

    act(() => {
      tree.update(<Button loading>Save</Button>);
    });
    const animatedContainer = tree.root.findByType(View);
    expect(animatedContainer.props.style).toEqual({ transform: [{ scale: 1 }] });

    act(() => findPressable(tree).props.onPressIn({}));
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
  });

  test('fires semantic haptics on commit for default and destructive variants only', () => {
    const onDefaultPress = jest.fn();
    const defaultPressable = findPressable(render('Send', { onPress: onDefaultPress }));

    act(() => defaultPressable.props.onPressIn({}));
    expect(mockImpactAsync).not.toHaveBeenCalled();

    act(() => defaultPressable.props.onPress({}));
    expect(mockImpactAsync).toHaveBeenCalledWith('light');
    expect(onDefaultPress).toHaveBeenCalledTimes(1);

    mockImpactAsync.mockClear();
    const onDestructivePress = jest.fn();
    const destructivePressable = findPressable(
      render('Delete', { onPress: onDestructivePress, variant: 'destructive' }),
    );
    act(() => destructivePressable.props.onPress({}));
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    expect(onDestructivePress).toHaveBeenCalledTimes(1);

    mockImpactAsync.mockClear();
    for (const variant of ['outline', 'secondary', 'ghost', 'tonal', 'link', 'text'] as const) {
      const onQuietPress = jest.fn();
      const quietPressable = findPressable(render('Action', { onPress: onQuietPress, variant }));
      act(() => quietPressable.props.onPress({}));
      expect(onQuietPress).toHaveBeenCalledTimes(1);
    }
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockSelectionAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  test('allows callers to override or suppress button haptics and keeps omitted onPress undefined', () => {
    const onSelect = jest.fn();
    const customHaptic = findPressable(
      render('Select', { haptic: 'selection', onPress: onSelect, variant: 'secondary' }),
    );
    act(() => customHaptic.props.onPress({}));
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);

    const onMuted = jest.fn();
    const muted = findPressable(render('Muted', { haptic: false, onPress: onMuted }));
    act(() => muted.props.onPress({}));
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(onMuted).toHaveBeenCalledTimes(1);

    const triggerOnly = findPressable(render('Menu Trigger'));
    expect(triggerOnly.props.onPress).toBeUndefined();
  });
});
