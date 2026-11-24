import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FloatingNavDock } from '../FloatingNavDock';
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
  activeDestination: 'more' as const,
  activeDockTab: 'more' as const,
  dragState: null as NavDragState | null,
  isAtRoot: true,
  isDockVisible: true,
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

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Surface: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('Surface', props, children),
  };
});

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
    useAnimatedStyle: (factory: () => object) => factory(),
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
    mockShellState = {
      activeDestination: 'more',
      activeDockTab: 'more',
      dragState: null,
      isAtRoot: true,
      isDockVisible: true,
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
      row.props.onLayout({ nativeEvent: { layout: { height: 44 } } });
    });
    expect(mockShellState.reportDockHeight).toHaveBeenCalledWith(44);
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
