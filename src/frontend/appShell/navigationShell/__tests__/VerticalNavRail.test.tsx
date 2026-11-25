import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NavDragState } from '../state';
import { VerticalNavRail } from '../VerticalNavRail';

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

let mockInsets = { bottom: 0, left: 0, right: 86, top: 0 };
let mockShellState = {
  activeDestination: 'chat' as const,
  activeDockTab: 'chat' as const,
  dragState: null as NavDragState | null,
  isAtRoot: true,
  isVerticalRailVisible: true,
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
  shellMode: 'vertical-rail' as 'compact-dock' | 'vertical-rail' | 'wide-rail',
};

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Surface: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('Surface', props, children),
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
  useSafeAreaInsets: () => mockInsets,
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

function renderedRailOrder(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.testID === 'string' &&
        (node.props.testID.startsWith('vertical-rail-tab-') ||
          node.props.testID.startsWith('vertical-rail-preview-')),
    )
    .map((node) => String(node.props.testID));
}

describe('VerticalNavRail', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInsets = { bottom: 0, left: 0, right: 86, top: 0 };
    mockShellState = {
      activeDestination: 'chat',
      activeDockTab: 'chat',
      dragState: null,
      isAtRoot: true,
      isVerticalRailVisible: true,
      navigateToDestination: jest.fn(),
      pinnedTabs: ['agents'],
      registerDockRect: jest.fn(),
      shellMode: 'vertical-rail',
    };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('overlays only the OS trailing bar width with hairline divider and Liquid Glass capsule', () => {
    act(() => {
      renderer = create(<VerticalNavRail />);
    });

    const rail = renderer!.root.findByProps({ testID: 'vertical-nav-rail' });
    expect(rail.props.pointerEvents).toBe('box-none');
    expect(rail.props.style).toEqual({ width: 86 });

    const divider = renderer!.root.findByProps({ testID: 'vertical-nav-rail-divider' });
    expect(divider.props.pointerEvents).toBe('none');
    expect(divider.props.style).toEqual({ width: StyleSheet.hairlineWidth });

    const surface = renderer!.root.findByType('Surface' as never);
    expect(surface.props.shape).toBe('pill');
    expect(renderedRailOrder(renderer!)).toEqual([
      'vertical-rail-tab-chat',
      'vertical-rail-tab-agents',
      'vertical-rail-tab-more',
    ]);

    const activeTab = renderer!.root.findByProps({ testID: 'vertical-rail-tab-chat' });
    const activeCapsule = activeTab
      .findAllByType(View)
      .find((view) => !view.props.testID && view.props.className?.split(' ').includes('h-11'));
    expect(activeCapsule).toBeDefined();
    expect(activeCapsule!.props.collapsable).toBe(false);
    expect(activeCapsule!.props.className.split(' ')).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-secondary-active']),
    );

    const inactiveTab = renderer!.root.findByProps({ testID: 'vertical-rail-tab-more' });
    const inactiveCapsule = inactiveTab
      .findAllByType(View)
      .find((view) => !view.props.testID && view.props.className?.split(' ').includes('h-11'));
    expect(inactiveCapsule).toBeDefined();
    expect(inactiveCapsule!.props.collapsable).toBe(false);
    expect(inactiveCapsule!.props.className.split(' ')).toContain('rounded-full');
    expect(inactiveCapsule!.props.className.split(' ')).not.toContain('bg-secondary-active');
  });

  it('shows monochrome live drop preview and status pill when dragging over the vertical capsule', () => {
    mockShellState.dragState = {
      draggingOut: false,
      id: 'marketplace',
      insertIndex: 0,
      overDock: true,
      source: 'more',
    };

    act(() => {
      renderer = create(<VerticalNavRail />);
    });

    expect(renderedRailOrder(renderer!)).toEqual([
      'vertical-rail-tab-chat',
      'vertical-rail-preview-marketplace',
      'vertical-rail-tab-agents',
      'vertical-rail-tab-more',
    ]);
    expect(renderer!.root.findByProps({ testID: 'vertical-rail-status-pill' })).toBeTruthy();
  });

  it('keeps rail mounted while fading on child screens and unmounts outside vertical-rail mode', () => {
    mockShellState.isAtRoot = false;
    mockShellState.isVerticalRailVisible = false;
    act(() => {
      renderer = create(<VerticalNavRail />);
    });
    const hiddenRail = renderer!.root.findByProps({ testID: 'vertical-nav-rail' });
    expect(hiddenRail.props.pointerEvents).toBe('none');
    expect(hiddenRail.props.accessibilityElementsHidden).toBe(true);

    mockShellState.isAtRoot = true;
    mockShellState.isVerticalRailVisible = true;
    mockShellState.shellMode = 'compact-dock';
    act(() => {
      renderer!.update(<VerticalNavRail />);
    });
    expect(renderer!.toJSON()).toBeNull();
  });
});
