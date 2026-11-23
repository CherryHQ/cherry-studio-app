import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NavDragState } from '../state';
import { VerticalNavRail } from '../VerticalNavRail';

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
  });

  it('shows monochrome live drop preview and status pill when dragging over the vertical capsule', () => {
    mockShellState.dragState = {
      draggingOut: false,
      id: 'marketplace',
      insertIndex: 0,
      overDock: true,
      source: 'more',
      x: 420,
      y: 540,
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

  it('hides outside root screens or in non-vertical modes', () => {
    mockShellState.isAtRoot = false;
    act(() => {
      renderer = create(<VerticalNavRail />);
    });
    expect(renderer!.toJSON()).toBeNull();

    mockShellState.isAtRoot = true;
    mockShellState.shellMode = 'compact-dock';
    act(() => {
      renderer!.update(<VerticalNavRail />);
    });
    expect(renderer!.toJSON()).toBeNull();
  });
});
