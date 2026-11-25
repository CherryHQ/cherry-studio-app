import { NavigationContext } from 'expo-router/react-navigation';
import { type ContextType, useLayoutEffect } from 'react';
import { Keyboard, type KeyboardEvent } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NavigationShellProvider } from '../NavigationShellProvider';
import {
  useHideFloatingDock,
  useNavigationShell,
  useNavigationShellActions,
  useNavigationShellInteraction,
  useReportMiddleColumnWidth,
} from '../state';

const mockToastShow = jest.fn();
const mockSetPreference = jest.fn().mockResolvedValue(undefined);
let mockPinnedPreference: string[] = ['agents'];
let mockPathname = '/';
let mockDimensions = { height: 852, width: 393 };
let mockInsets = { bottom: 34, left: 0, right: 0, top: 59 };
let mockWindowClass: 'compact' | 'wide' = 'compact';
let mockFold: { height: number; width: number; x: number; y: number } | null = null;
let mockPlatformOS: 'ios' | 'android' = 'ios';

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('@cherrystudio/ui/haptics', () => ({
  haptics: {
    error: jest.fn(),
    light: jest.fn(),
    medium: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    trigger: jest.fn(),
    warning: jest.fn(),
  },
}));
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    useSharedValue: <T,>(initialValue: T) => {
      const ref = useRef(null as unknown);
      if (ref.current === null) {
        let current = initialValue;
        ref.current = {
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
      }
      return ref.current;
    },
  };
});
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    dismiss: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));
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
    useWindowDimensions: { enumerable: true, value: () => mockDimensions },
  });
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('@/frontend/appShell/layout', () => ({
  isAcross: () => false,
  useFoldRegionLayout: () => (mockFold ? { fold: mockFold } : null),
  useWindowClass: () => mockWindowClass,
}));
jest.mock('@/frontend/data/hooks/usePreference', () => ({
  usePreference: () => [
    mockPinnedPreference,
    (next: string[]) => {
      mockPinnedPreference = next;
      return mockSetPreference(next);
    },
  ],
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let latest: ReturnType<typeof useNavigationShell>;
let latestInteraction: ReturnType<typeof useNavigationShellInteraction>;
let renderer: ReactTestRenderer;

function createFocusableNavigation(initialFocused = true) {
  let focused = initialFocused;
  const listeners: Record<'blur' | 'focus', Set<() => void>> = {
    blur: new Set(),
    focus: new Set(),
  };
  const navigation = {
    addListener: (event: 'blur' | 'focus', listener: () => void) => {
      listeners[event].add(listener);
      return () => {
        listeners[event].delete(listener);
      };
    },
    isFocused: () => focused,
  } as unknown as ContextType<typeof NavigationContext>;

  const emit = (event: 'blur' | 'focus') => {
    focused = event === 'focus';
    for (const listener of listeners[event]) {
      listener();
    }
  };

  return { emit, navigation };
}

function Probe({
  hideDock = false,
  middleWidth = 0,
}: {
  hideDock?: boolean;
  middleWidth?: number;
}) {
  const shell = useNavigationShell();
  const interaction = useNavigationShellInteraction();
  useHideFloatingDock(hideDock);
  useReportMiddleColumnWidth('sidebar', middleWidth);
  useLayoutEffect(() => {
    latest = shell;
    latestInteraction = interaction;
  });
  return null;
}

describe('NavigationShellProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPinnedPreference = ['agents'];
    mockPathname = '/';
    mockDimensions = { height: 852, width: 393 };
    mockInsets = { bottom: 34, left: 0, right: 0, top: 59 };
    mockWindowClass = 'compact';
    mockFold = null;
    mockPlatformOS = 'ios';
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('resolves shellMode cleanly for compact-dock, wide-rail, and vertical-rail', () => {
    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.shellMode).toBe('compact-dock');
    expect(latest.isDockVisible).toBe(true);
    expect(latest.isVerticalRailVisible).toBe(false);
    expect(latest.dockClearance).toBe(38);

    mockInsets = { bottom: 0, left: 0, right: 0, top: 20 };
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.shellMode).toBe('compact-dock');
    expect(latest.isVerticalRailVisible).toBe(false);
    expect(latest.dockClearance).toBe(66);

    mockWindowClass = 'wide';
    mockDimensions = { height: 834, width: 1194 };
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe middleWidth={280} />
        </NavigationShellProvider>,
      );
    });
    expect(latest.shellMode).toBe('wide-rail');
    expect(latest.isDockVisible).toBe(false);
    expect(latest.isVerticalRailVisible).toBe(false);
    expect(latest.dockClearance).toBe(0);
    expect(latest.middleColumnWidth).toBe(280);

    mockWindowClass = 'compact';
    mockInsets = { bottom: 0, left: 0, right: 64, top: 12 };
    mockDimensions = { height: 420, width: 780 };
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.shellMode).toBe('vertical-rail');
    expect(latest.isDockVisible).toBe(false);
    expect(latest.isVerticalRailVisible).toBe(true);
  });

  it('keeps dock visible when keyboard opens, cancels active drag on keyboardDidShow, and hides dock for overlays or detail routes', () => {
    const keyboardListeners: Record<string, (event: KeyboardEvent) => void> = {};
    const addListenerSpy = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((event, listener) => {
        keyboardListeners[event] = listener as (keyboardEvent: KeyboardEvent) => void;
        return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
      });

    try {
      act(() => {
        renderer = create(
          <NavigationShellProvider>
            <Probe />
          </NavigationShellProvider>,
        );
      });
      expect(latest.isDockVisible).toBe(true);
      expect(addListenerSpy).not.toHaveBeenCalled();

      act(() => {
        latest.registerDockRect({ height: 44, width: 400, x: 0, y: 760 });
        latest.startDrag({ id: 'drawings', source: 'more', x: 140, y: 700 });
      });
      expect(latestInteraction.dragState).not.toBeNull();
      expect(keyboardListeners.keyboardDidShow).toBeDefined();

      act(() => {
        keyboardListeners.keyboardDidShow?.({} as KeyboardEvent);
      });
      expect(latestInteraction.dragState).toBeNull();
      expect(latest.isDockVisible).toBe(true);

      act(() => {
        renderer.update(
          <NavigationShellProvider>
            <Probe hideDock />
          </NavigationShellProvider>,
        );
      });
      expect(latest.isDockVisible).toBe(false);

      mockPathname = '/files/123';
      act(() => {
        renderer.update(
          <NavigationShellProvider>
            <Probe />
          </NavigationShellProvider>,
        );
      });
      expect(latest.isDockVisible).toBe(false);
      expect(latest.dockClearance).toBe(0);
      expect(latest.restingDockClearance).toBe(38);
    } finally {
      addListenerSpy.mockRestore();
    }
  });

  it('scopes useHideFloatingDock registration to screen focus and blur transitions', () => {
    const focusedScreen = createFocusableNavigation(true);
    const blurredScreen = createFocusableNavigation(false);

    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <NavigationContext value={focusedScreen.navigation}>
            <Probe hideDock />
          </NavigationContext>
        </NavigationShellProvider>,
      );
    });
    expect(latest.isDockVisible).toBe(false);

    act(() => {
      focusedScreen.emit('blur');
    });
    expect(latest.isDockVisible).toBe(true);

    act(() => {
      focusedScreen.emit('focus');
    });
    expect(latest.isDockVisible).toBe(false);

    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <NavigationContext value={blurredScreen.navigation}>
            <Probe hideDock />
          </NavigationContext>
        </NavigationShellProvider>,
      );
    });
    expect(latest.isDockVisible).toBe(true);

    act(() => {
      blurredScreen.emit('focus');
    });
    expect(latest.isDockVisible).toBe(false);
  });

  it('keeps Android floating dock clear of system bar and auto-cancels active drag when leaving root', () => {
    mockPlatformOS = 'android';
    mockInsets = { bottom: 24, left: 0, right: 0, top: 24 };
    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });

    expect(latest.dockClearance).toBe(60);
    expect(latest.restingDockClearance).toBe(60);

    act(() => {
      latest.registerDockRect({ height: 44, width: 400, x: 0, y: 760 });
      latest.startDrag({ id: 'drawings', source: 'more', x: 140, y: 700 });
    });
    expect(latestInteraction.dragState).not.toBeNull();

    mockPathname = '/drawings/templates';
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.dockClearance).toBe(0);
    expect(latest.restingDockClearance).toBe(60);
    expect(latestInteraction.dragState).toBeNull();
  });

  it('enforces max 3 middle tabs and prevents unpinning core agents tab', () => {
    mockPinnedPreference = ['agents', 'drawings', 'files'];
    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });

    expect(latest.pinTabToDock('plugins')).toBe(false);
    expect(mockToastShow).toHaveBeenLastCalledWith({ label: 'navigation.dockFullToast' });

    expect(latest.unpinTabFromDock('agents')).toBe(false);
    expect(mockToastShow).toHaveBeenLastCalledWith({ label: 'navigation.coreTabCannotUnpin' });

    expect(latest.unpinTabFromDock('drawings')).toBe(true);
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents', 'files']);
  });

  it('tracks symmetrical middle drop slots, 72pt top slop, and executes pin/reorder/unpin on drop', () => {
    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });

    act(() => {
      latest.registerDockRect({ height: 44, width: 400, x: 0, y: 780 });
      // Enter top hit slop (780 - 72 = 708): x in left half of middle band -> insertIndex 0
      latest.startDrag({ id: 'drawings', source: 'more', x: 140, y: 720 });
    });
    expect(latestInteraction.dragState).toMatchObject({
      draggingOut: false,
      id: 'drawings',
      insertIndex: 0,
      overDock: true,
      source: 'more',
    });
    expect(latestInteraction.dragPosition.x.get()).toBe(140);
    expect(latestInteraction.dragPosition.y.get()).toBe(720);

    // Move to right half of middle band -> insertIndex 1
    act(() => {
      latest.updateDrag(280, 790);
    });
    expect(latestInteraction.dragState).toMatchObject({
      insertIndex: 1,
      overDock: true,
    });
    expect(latestInteraction.dragPosition.x.get()).toBe(280);
    expect(latestInteraction.dragPosition.y.get()).toBe(790);

    // Drop on dock -> pins drawings at index 1
    act(() => {
      latest.endDrag();
    });
    expect(latestInteraction.dragState).toBeNull();
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents', 'drawings']);

    // Now reorder drawings to slot 0 inside dock
    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 260, y: 800 });
      latest.updateDrag(120, 800);
    });
    expect(latestInteraction.dragState).toMatchObject({
      draggingOut: false,
      insertIndex: 0,
      overDock: true,
    });
    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['drawings', 'agents']);

    // Drag drawings above dock (780 - 56 = 724) -> unpins on release, whereas agents cannot unpin
    act(() => {
      latest.startDrag({ id: 'agents', source: 'dock', x: 260, y: 800 });
      latest.updateDrag(260, 700);
    });
    expect(latestInteraction.dragState?.draggingOut).toBe(false);
    act(() => {
      latest.endDrag();
    });

    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 140, y: 800 });
      latest.updateDrag(140, 700);
    });
    expect(latestInteraction.dragState?.draggingOut).toBe(true);
    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents']);
  });

  it('supports vertical-rail drag pin, vertical reorder, and leftward unpin on Duo', () => {
    mockWindowClass = 'compact';
    mockInsets = { bottom: 0, left: 0, right: 86, top: 0 };
    mockDimensions = { height: 678, width: 466 };

    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });

    expect(latest.shellMode).toBe('vertical-rail');
    expect(latest.isVerticalRailVisible).toBe(true);

    act(() => {
      latest.registerDockRect({ height: 152, width: 52, x: 397, y: 500 });
      // Enter leftward hit slop (397 - 56 = 341): y in upper middle band -> insertIndex 0
      latest.startDrag({ id: 'drawings', source: 'more', x: 360, y: 540 });
    });
    expect(latestInteraction.dragState).toMatchObject({
      draggingOut: false,
      insertIndex: 0,
      overDock: true,
    });

    // Move to lower middle band -> insertIndex 1
    act(() => {
      latest.updateDrag(420, 610);
    });
    expect(latestInteraction.dragState).toMatchObject({
      insertIndex: 1,
      overDock: true,
    });

    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents', 'drawings']);

    // Reorder inside vertical rail
    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 420, y: 600 });
      latest.updateDrag(420, 535);
    });
    expect(latestInteraction.dragState).toMatchObject({
      draggingOut: false,
      insertIndex: 0,
      overDock: true,
    });
    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['drawings', 'agents']);

    // Drag left outside rail (x < 397 - 56 = 341) -> unpin drawings, while protecting core agents
    act(() => {
      latest.startDrag({ id: 'agents', source: 'dock', x: 420, y: 580 });
      latest.updateDrag(300, 580);
    });
    expect(latestInteraction.dragState?.draggingOut).toBe(false);
    act(() => {
      latest.endDrag();
    });

    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 420, y: 535 });
      latest.updateDrag(300, 535);
    });
    expect(latestInteraction.dragState?.draggingOut).toBe(true);
    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents']);
  });

  it('isolates drag and popover interactions from layout and actions consumers', () => {
    let layoutRenders = 0;
    let actionRenders = 0;
    let interactionRenders = 0;
    let actionsRef: ReturnType<typeof useNavigationShellActions>;
    let interactionRef: ReturnType<typeof useNavigationShellInteraction>;

    function LayoutConsumer() {
      useNavigationShell();
      useLayoutEffect(() => {
        layoutRenders += 1;
      });
      return null;
    }

    function ActionConsumer() {
      const actions = useNavigationShellActions();
      useLayoutEffect(() => {
        actionsRef = actions;
        actionRenders += 1;
      });
      return null;
    }

    function InteractionConsumer() {
      const interaction = useNavigationShellInteraction();
      useLayoutEffect(() => {
        interactionRef = interaction;
        interactionRenders += 1;
      });
      return null;
    }

    const staticTree = (
      <>
        <LayoutConsumer />
        <ActionConsumer />
        <InteractionConsumer />
      </>
    );

    act(() => {
      renderer = create(<NavigationShellProvider>{staticTree}</NavigationShellProvider>);
    });

    expect(layoutRenders).toBe(1);
    expect(actionRenders).toBe(1);
    expect(interactionRenders).toBe(1);

    act(() => {
      actionsRef.registerDockRect({ height: 44, width: 400, x: 0, y: 780 });
      actionsRef.openPinPopover({ id: 'drawings', source: 'more', x: 100, y: 200 });
    });

    expect(layoutRenders).toBe(1);
    expect(actionRenders).toBe(1);
    expect(interactionRenders).toBe(2);

    // Dragging outside the dock hit zone through release causes 0 layout/action re-renders.
    act(() => {
      actionsRef.startDrag({ id: 'drawings', source: 'more', x: 100, y: 200 });
    });
    expect(layoutRenders).toBe(1);
    expect(actionRenders).toBe(1);
    expect(interactionRenders).toBe(3);

    // Continuous pointer movement inside the same discrete region updates SharedValues with 0 React re-renders.
    act(() => {
      actionsRef.updateDrag(125, 225);
      actionsRef.updateDrag(130, 230);
      actionsRef.updateDrag(135, 235);
    });

    expect(layoutRenders).toBe(1);
    expect(actionRenders).toBe(1);
    expect(interactionRenders).toBe(3);
    expect(interactionRef!.dragPosition.x.get()).toBe(135);
    expect(interactionRef!.dragPosition.y.get()).toBe(235);

    act(() => {
      actionsRef.endDrag();
    });
    expect(layoutRenders).toBe(1);
    expect(actionRenders).toBe(1);
    expect(interactionRenders).toBe(4);

    // Dropping on dock mutates pinnedTabs -> layout consumer updates once, actions stay constant.
    act(() => {
      actionsRef.startDrag({ id: 'drawings', source: 'more', x: 120, y: 720 });
    });
    act(() => {
      actionsRef.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['drawings', 'agents']);
    expect(layoutRenders).toBe(2);
    expect(actionRenders).toBe(1);
  });
});
