import type { ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NavDestinationId, NavTabId } from '../dockTabs';
import { FloatingNavDock } from '../FloatingNavDock';
import { NavIcon } from '../NavIcon';
import type { NavDragState } from '../state';

const createMockSharedValue = <T,>(initialValue: T) => {
  let current = initialValue;
  return {
    get: () => current,
    set: (next: T) => {
      current = next;
    },
    get value() {
      return current;
    },
    set value(next: T) {
      current = next;
    },
  };
};

let mockShellState = {
  activeDestination: 'more' as NavDestinationId,
  activeDockTab: 'more' as NavTabId,
  dragState: null as NavDragState | null,
  isAtRoot: true,
  isDockVisible: true,
  isOnboardingBlocking: false,
  navigateToDestination: jest.fn(),
  pinnedTabs: ['agents'] as (
    | 'agents'
    | 'drawings'
    | 'files'
    | 'plugins'
    | 'marketplace'
    | 'devices'
  )[],
  registerDockRect: jest.fn(),
  reportDockHeight: jest.fn(),
  shellMode: 'compact-dock' as const,
};

const mockHapticsSelection = jest.fn();
const mockAnimatedStyles = new WeakMap<object, () => Record<string, unknown>>();
let mockPlatformOS: 'ios' | 'android' = 'ios';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: {
      enumerable: true,
      value: Object.defineProperties(Object.create(actual.Platform), {
        OS: { enumerable: true, get: () => mockPlatformOS },
        select: {
          enumerable: true,
          value: <T,>(spec: Partial<Record<'ios' | 'android' | 'default', T>>) =>
            spec[mockPlatformOS] ?? spec.default,
        },
      }),
    },
  });
});

function readAnimatedStyle(style: unknown): Record<string, unknown> {
  if (style && typeof style === 'object') {
    const updater = mockAnimatedStyles.get(style);
    if (updater) {
      return updater();
    }
    return style as Record<string, unknown>;
  }
  return {};
}

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Surface: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('Surface', props, children),
  };
});

jest.mock('@cherrystudio/ui/haptics', () => ({
  haptics: {
    selection: () => mockHapticsSelection(),
  },
}));

jest.mock('expo-linear-gradient', () => {
  const { createElement } = jest.requireActual('react');
  return {
    LinearGradient: (props: object) => createElement('LinearGradient', props),
  };
});

jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { fast: 200 },
  easing: { settle: 'settle' },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const transition = {
    duration: () => transition,
    easing: () => transition,
    reduceMotion: () => transition,
  };
  return {
    __esModule: true,
    default: {
      View: (props: Record<string, unknown>) => {
        const { createElement } = jest.requireActual('react');
        return createElement(View, props);
      },
    },
    FadeIn: transition,
    FadeOut: transition,
    LinearTransition: transition,
    ReduceMotion: { System: 'system' },
    ZoomIn: transition,
    useAnimatedStyle: (factory: () => Record<string, unknown>) => {
      const style = {};
      mockAnimatedStyles.set(style, factory);
      return style;
    },
    useSharedValue: <T,>(initialValue: T) => {
      const { useRef } = jest.requireActual('react');
      const ref = useRef(null as unknown);
      if (ref.current === null) {
        ref.current = createMockSharedValue(initialValue);
      }
      return ref.current;
    },
    withTiming: (value: number) => value,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: 'rgba(255,255,255,0)' }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (tokens: string[]) => tokens,
}));

jest.mock('../NavIcon', () => {
  const { createElement } = jest.requireActual('react');
  return {
    NavIcon: (props: object) => createElement('NavIcon', props),
  };
});

jest.mock('../usePinDragGesture', () => ({
  usePinDragGesture: () => ({}),
}));

jest.mock('../state', () => ({
  useNavigationShell: () => mockShellState,
  useNavigationShellInteraction: () => ({
    dragPosition: { x: createMockSharedValue(0), y: createMockSharedValue(0) },
    dragState: mockShellState.dragState,
    popover: null,
  }),
}));

function renderedDockOrder(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.testID === 'string' &&
        (node.props.testID.startsWith('floating-nav-tab-') ||
          node.props.testID.startsWith('floating-nav-preview-')),
    )
    .map((node) => String(node.props.testID));
}

describe('FloatingNavDock drag preview', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformOS = 'ios';
    mockShellState = {
      activeDestination: 'more',
      activeDockTab: 'more',
      dragState: null,
      isAtRoot: true,
      isDockVisible: true,
      isOnboardingBlocking: false,
      navigateToDestination: jest.fn(),
      pinnedTabs: ['agents'],
      registerDockRect: jest.fn(),
      reportDockHeight: jest.fn(),
      shellMode: 'compact-dock',
    };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('mounts no dock or controls while first-use admission is blocked', () => {
    mockShellState.isDockVisible = false;
    mockShellState.isOnboardingBlocking = true;
    act(() => {
      renderer = create(<FloatingNavDock />);
    });
    expect(renderer!.toJSON()).toBeNull();

    mockShellState.isDockVisible = true;
    mockShellState.isOnboardingBlocking = false;
    act(() => renderer!.update(<FloatingNavDock />));
    expect(renderer!.root.findByProps({ testID: 'floating-nav-dock' }).props.pointerEvents).toBe(
      'box-none',
    );
  });

  test('renders ChatGPT-aligned full-pill active background, spacing, and 24dp icons', () => {
    mockShellState.dragState = {
      draggingOut: false,
      id: 'drawings',
      insertIndex: 0,
      overDock: true,
      source: 'more',
    };
    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const row = renderer!.root.findByProps({ testID: 'floating-nav-row' });
    expect(row.props.className.split(' ')).toEqual(expect.arrayContaining(['gap-2', 'px-6']));

    const activeTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-more' });
    const activeClip = renderer!.root
      .findAllByType(View)
      .find(
        (view) =>
          view.props.className?.split(' ').includes('h-[46px]') &&
          view.findAllByProps({ testID: 'floating-nav-tab-more' }).length > 0,
      );
    expect(activeClip).toBeDefined();
    expect(activeClip!.props.collapsable).toBe(false);
    expect(activeClip!.props.className.split(' ')).toEqual(
      expect.arrayContaining(['h-[46px]', 'w-full', 'overflow-hidden', 'rounded-full']),
    );
    expect(activeClip!.props.className).not.toMatch(/border/);

    const activeSlotWrapper = renderer!.root
      .findAllByType(View)
      .find(
        (view) =>
          view.props.className?.split(' ').includes('max-w-[100px]') &&
          view.findAllByProps({ testID: 'floating-nav-tab-more' }).length > 0,
      );
    expect(activeSlotWrapper?.props.className.split(' ')).toEqual(
      expect.arrayContaining(['flex-1', 'max-w-[100px]']),
    );

    const activePill = renderer!.root.findByProps({ testID: 'floating-nav-active-pill-more' });
    expect(activePill.props.collapsable).toBe(false);
    expect(activePill.props.className.split(' ')).toEqual(
      expect.arrayContaining(['bg-secondary', 'dark:bg-secondary-active', 'rounded-full']),
    );
    expect(activePill.props.className).not.toMatch(/border/);
    expect(activePill.props.style).toEqual({ opacity: 1 });

    const activeIcons = activeTab.findAllByType(NavIcon);
    expect(activeIcons).toHaveLength(1);
    expect(activeIcons[0].props).toMatchObject({
      color: 'foreground',
      filled: true,
      size: 24,
      strokeWidth: 2,
    });
    expect(activeTab.findAll((node) => node.props?.className === 'opacity-75')).toHaveLength(0);

    const inactiveTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-chat' });
    const inactiveIcons = inactiveTab.findAllByType(NavIcon);
    expect(inactiveIcons).toHaveLength(1);
    expect(inactiveIcons[0].props).toMatchObject({
      color: 'muted-foreground',
      filled: false,
      size: 24,
      strokeWidth: 2,
    });

    const inactivePill = renderer!.root.findByProps({ testID: 'floating-nav-active-pill-chat' });
    expect(inactivePill.props.collapsable).toBe(false);
    expect(inactivePill.props.className.split(' ')).toEqual(
      expect.arrayContaining(['bg-secondary', 'dark:bg-secondary-active', 'rounded-full']),
    );
    expect(inactivePill.props.style).toEqual({ opacity: 0 });

    const preview = renderer!.root.findByProps({ testID: 'floating-nav-preview-drawings' });
    const previewCapsule = preview
      .findAllByType(View)
      .find((view) => view.props.className?.split(' ').includes('h-[46px]'));
    expect(previewCapsule?.props.collapsable).toBe(false);
    expect(previewCapsule?.props.className.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-secondary', 'dark:bg-secondary-active']),
    );
    const previewBorder = renderer!.root.findByProps({
      testID: 'floating-nav-dashed-border-drawings',
    });
    expect(previewBorder.props.className.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'border-border-selected', 'border-dashed']),
    );
  });

  test('keeps active background pills uncollapsed while swapping state instantly on Android', () => {
    mockPlatformOS = 'android';
    mockShellState.activeDestination = 'chat';
    mockShellState.activeDockTab = 'chat';

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const initialChatPill = renderer!.root.findByProps({
      testID: 'floating-nav-active-pill-chat',
    });
    const initialMorePill = renderer!.root.findByProps({
      testID: 'floating-nav-active-pill-more',
    });
    const initialClassName = initialMorePill.props.className;
    expect(initialChatPill.props.collapsable).toBe(false);
    expect(initialChatPill.props.style).toEqual({ opacity: 1 });
    expect(initialMorePill.props.collapsable).toBe(false);
    expect(initialMorePill.props.style).toEqual({ opacity: 0 });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-tab-chat' }).findByType(NavIcon).props,
    ).toMatchObject({ color: 'foreground', filled: true });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-tab-more' }).findByType(NavIcon).props,
    ).toMatchObject({ color: 'muted-foreground', filled: false });

    mockShellState.activeDestination = 'more';
    mockShellState.activeDockTab = 'more';
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    const selectedMorePill = renderer!.root.findByProps({
      testID: 'floating-nav-active-pill-more',
    });
    const unselectedChatPill = renderer!.root.findByProps({
      testID: 'floating-nav-active-pill-chat',
    });
    expect(selectedMorePill.props.collapsable).toBe(false);
    expect(selectedMorePill.props.className).toBe(initialClassName);
    expect(selectedMorePill.props.style).toEqual({ opacity: 1 });
    expect(unselectedChatPill.props.collapsable).toBe(false);
    expect(unselectedChatPill.props.style).toEqual({ opacity: 0 });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-tab-more' }).findByType(NavIcon).props,
    ).toMatchObject({ color: 'foreground', filled: true });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-tab-chat' }).findByType(NavIcon).props,
    ).toMatchObject({ color: 'muted-foreground', filled: false });

    mockShellState.activeDestination = 'chat';
    mockShellState.activeDockTab = 'chat';
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    const reselectedChatPill = renderer!.root.findByProps({
      testID: 'floating-nav-active-pill-chat',
    });
    expect(reselectedChatPill.props.collapsable).toBe(false);
    expect(reselectedChatPill.props.className).toBe(initialClassName);
    expect(reselectedChatPill.props.style).toEqual({ opacity: 1 });
  });

  test('moves a single iOS selection pill between measured tabs while icons switch immediately', () => {
    mockShellState.activeDestination = 'chat';
    mockShellState.activeDockTab = 'chat';
    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const slots = renderer!.root
      .findAllByType(View)
      .filter((view) => view.props.className?.split(' ').includes('max-w-[100px]'));
    act(() => {
      slots[0].props.onLayout({ nativeEvent: { layout: { x: 43, width: 100 } } });
      slots[2].props.onLayout({ nativeEvent: { layout: { x: 259, width: 100 } } });
    });

    const pill = renderer!.root.findByProps({ testID: 'floating-nav-selection-pill' });
    expect(readAnimatedStyle(pill.props.style)).toEqual({
      transform: [{ translateX: 43 }],
      width: 100,
    });

    mockShellState.activeDestination = 'more';
    mockShellState.activeDockTab = 'more';
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    expect(renderer!.root.findByProps({ testID: 'floating-nav-selection-pill' })).toBe(pill);
    expect(readAnimatedStyle(pill.props.style)).toEqual({
      transform: [{ translateX: 259 }],
      width: 100,
    });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-active-pill-more' }).props.style,
    ).toEqual({ opacity: 0 });
    expect(
      renderer!.root.findByProps({ testID: 'floating-nav-tab-more' }).findByType(NavIcon).props,
    ).toMatchObject({ filled: true, size: 24 });
  });

  test('uses non-scaling press wash on iOS, selection haptics on inactive switches, and bounded ripple on Android', () => {
    mockShellState.activeDestination = 'chat';
    mockShellState.activeDockTab = 'chat';

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const moreTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-more' });
    expect(
      moreTab
        .findAllByType(View)
        .filter((view) => view.props.className?.split(' ').includes('h-6')),
    ).toHaveLength(0);

    act(() => {
      moreTab.props.onPressIn();
    });
    expect(
      readAnimatedStyle(
        renderer!.root.findByProps({ testID: 'floating-nav-press-wash-more' }).props.style,
      ),
    ).toEqual({ opacity: 0.75 });

    act(() => {
      moreTab.props.onPressOut();
    });
    expect(
      readAnimatedStyle(
        renderer!.root.findByProps({ testID: 'floating-nav-press-wash-more' }).props.style,
      ),
    ).toEqual({ opacity: 0 });

    act(() => {
      moreTab.props.onPress();
    });
    expect(mockHapticsSelection).toHaveBeenCalledTimes(1);
    expect(mockShellState.navigateToDestination).toHaveBeenCalledWith('more');

    const chatTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-chat' });
    act(() => {
      chatTab.props.onPress();
    });
    expect(mockHapticsSelection).toHaveBeenCalledTimes(1);
    expect(mockShellState.navigateToDestination).toHaveBeenCalledWith('chat');

    // Android uses native bounded foreground ripple with the secondary token and omits JS press wash.
    mockPlatformOS = 'android';
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });
    const androidTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-more' });
    expect(androidTab.props.android_ripple).toEqual({
      borderless: false,
      color: 'secondary',
      foreground: true,
    });
    expect(renderer!.root.findAllByProps({ testID: 'floating-nav-press-wash-more' })).toHaveLength(
      0,
    );
  });

  test('inserts live dashed preview slot inside the middle band and shows drop banner when dragging from More', () => {
    mockShellState.dragState = {
      draggingOut: false,
      id: 'drawings',
      insertIndex: 0,
      overDock: true,
      source: 'more',
    };

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const dock = renderer!.root.findByProps({ testID: 'floating-nav-dock' });
    const tray = dock.findByProps({ testID: 'floating-dock-drop-tray' });
    expect(tray.props.className).toContain('bg-secondary/25');
    expect(tray.props.className).not.toContain('border-primary');

    const glassSurfaces = dock.findAllByType('Surface' as never);
    expect(glassSurfaces.every((surface) => surface.props.shape === 'pill')).toBe(true);
    expect(glassSurfaces.length).toBeGreaterThanOrEqual(2);

    const banner = dock.findByProps({ testID: 'floating-dock-status-pill' });
    expect(banner.props.children.props.children).toBe('navigation.dropToPin');

    expect(renderedDockOrder(renderer!)).toEqual([
      'floating-nav-tab-chat',
      'floating-nav-preview-drawings',
      'floating-nav-tab-agents',
      'floating-nav-tab-more',
    ]);

    mockShellState.dragState = { ...mockShellState.dragState, insertIndex: 1 };
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    expect(renderedDockOrder(renderer!)).toEqual([
      'floating-nav-tab-chat',
      'floating-nav-tab-agents',
      'floating-nav-preview-drawings',
      'floating-nav-tab-more',
    ]);
  });

  test('shows full-dock warning pill without preview slot when 3 middle tabs are already pinned', () => {
    mockShellState.pinnedTabs = ['agents', 'files', 'plugins'];
    mockShellState.dragState = {
      draggingOut: false,
      id: 'drawings',
      insertIndex: 1,
      overDock: true,
      source: 'more',
    };

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const dock = renderer!.root.findByProps({ testID: 'floating-nav-dock' });
    const tray = dock.findByProps({ testID: 'floating-dock-drop-tray' });
    expect(tray.props.className).toContain('bg-secondary/50');
    expect(tray.props.className).not.toContain('border-destructive');

    const banner = dock.findByProps({ testID: 'floating-dock-status-pill' });
    expect(banner.props.children.props.children).toBe('navigation.dockFullToast');
    expect(renderer!.root.findAllByProps({ testID: 'floating-nav-preview-drawings' })).toHaveLength(
      0,
    );
  });

  test('keeps dragged dock tab mounted inside collapsed container when dragging out to unpin', () => {
    mockShellState.pinnedTabs = ['agents', 'drawings'];
    mockShellState.dragState = {
      draggingOut: true,
      id: 'drawings',
      insertIndex: 1,
      overDock: false,
      source: 'dock',
    };

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const banner = renderer!.root.findByProps({ testID: 'floating-dock-status-pill' });
    expect(banner.props.children.props.children).toBe('navigation.dropToUnpin');

    const detached = renderer!.root.findByProps({ testID: 'floating-nav-detached-drawings' });
    expect(detached.props.style).toEqual({
      height: 1,
      left: 0,
      opacity: 0,
      overflow: 'hidden',
      position: 'absolute',
      top: 0,
      width: 1,
    });
    expect(detached.findByProps({ testID: 'floating-nav-tab-drawings' })).toBeTruthy();

    const row = renderer!.root.findByProps({
      testID: 'floating-nav-row',
    });
    act(() => {
      row.props.onLayout({ nativeEvent: { layout: { height: 46 } } });
    });
    expect(mockShellState.reportDockHeight).toHaveBeenCalledWith(46);
  });

  test('keeps dragged tab fiber mounted in-place across drag-out transitions and hides dock without unmounting on child screens', () => {
    mockShellState.pinnedTabs = ['agents', 'drawings'];
    mockShellState.dragState = {
      draggingOut: false,
      id: 'drawings',
      insertIndex: 1,
      overDock: true,
      source: 'dock',
    };

    act(() => {
      renderer = create(<FloatingNavDock />);
    });

    const initialTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-drawings' });

    mockShellState.dragState = {
      draggingOut: true,
      id: 'drawings',
      insertIndex: 1,
      overDock: false,
      source: 'dock',
    };
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    const detachedTab = renderer!.root.findByProps({ testID: 'floating-nav-tab-drawings' });
    expect(detachedTab).toBe(initialTab);

    mockShellState.dragState = null;
    mockShellState.isAtRoot = false;
    mockShellState.isDockVisible = false;
    act(() => {
      renderer!.update(<FloatingNavDock />);
    });

    const hiddenDock = renderer!.root.findByProps({ testID: 'floating-nav-dock' });
    expect(hiddenDock.props.pointerEvents).toBe('none');
    expect(hiddenDock.props.accessibilityElementsHidden).toBe(true);
  });
});
