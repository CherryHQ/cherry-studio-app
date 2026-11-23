import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { NavigationShellProvider } from '../NavigationShellProvider';
import { useHideFloatingDock, useNavigationShell, useReportMiddleColumnWidth } from '../state';

const mockToastShow = jest.fn();
const mockSetPreference = jest.fn().mockResolvedValue(undefined);
let mockPinnedPreference: string[] = ['agents'];
let mockPathname = '/';
let mockDimensions = { height: 852, width: 393 };
let mockInsets = { bottom: 34, left: 0, right: 0, top: 59 };
let mockWindowClass: 'compact' | 'wide' = 'compact';
let mockFold: { height: number; width: number; x: number; y: number } | null = null;
let mockKeyboardVisible = false;

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    dismiss: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));
jest.mock('react-native', () => ({
  useWindowDimensions: () => mockDimensions,
}));
jest.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: (selector: (s: { isVisible: boolean }) => boolean) =>
    selector({ isVisible: mockKeyboardVisible }),
}));
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
let renderer: ReactTestRenderer;

function Probe({
  hideDock = false,
  middleWidth = 0,
}: {
  hideDock?: boolean;
  middleWidth?: number;
}) {
  const shell = useNavigationShell();
  useHideFloatingDock(hideDock);
  useReportMiddleColumnWidth('sidebar', middleWidth);
  useLayoutEffect(() => {
    latest = shell;
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
    mockKeyboardVisible = false;
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
    expect(latest.dockClearance).toBe(42);

    mockInsets = { bottom: 0, left: 0, right: 0, top: 20 };
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.shellMode).toBe('compact-dock');
    expect(latest.dockClearance).toBe(64);

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
  });

  it('hides dock when keyboard is open, overlay hides it, or route is a detail page', () => {
    act(() => {
      renderer = create(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.isDockVisible).toBe(true);

    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe hideDock />
        </NavigationShellProvider>,
      );
    });
    expect(latest.isDockVisible).toBe(false);

    mockKeyboardVisible = true;
    act(() => {
      renderer.update(
        <NavigationShellProvider>
          <Probe />
        </NavigationShellProvider>,
      );
    });
    expect(latest.isDockVisible).toBe(false);

    mockKeyboardVisible = false;
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
    expect(latest.dragState).toMatchObject({
      draggingOut: false,
      id: 'drawings',
      insertIndex: 0,
      overDock: true,
      source: 'more',
    });

    // Move to right half of middle band -> insertIndex 1
    act(() => {
      latest.updateDrag(280, 790);
    });
    expect(latest.dragState).toMatchObject({
      insertIndex: 1,
      overDock: true,
    });

    // Drop on dock -> pins drawings at index 1
    act(() => {
      latest.endDrag();
    });
    expect(latest.dragState).toBeNull();
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents', 'drawings']);

    // Now reorder drawings to slot 0 inside dock
    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 260, y: 800 });
      latest.updateDrag(120, 800);
    });
    expect(latest.dragState).toMatchObject({
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
    expect(latest.dragState?.draggingOut).toBe(false);
    act(() => {
      latest.endDrag();
    });

    act(() => {
      latest.startDrag({ id: 'drawings', source: 'dock', x: 140, y: 800 });
      latest.updateDrag(140, 700);
    });
    expect(latest.dragState?.draggingOut).toBe(true);
    act(() => {
      latest.endDrag();
    });
    expect(mockSetPreference).toHaveBeenLastCalledWith(['agents']);
  });
});
