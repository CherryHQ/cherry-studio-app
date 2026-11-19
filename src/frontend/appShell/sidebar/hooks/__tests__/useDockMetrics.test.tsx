import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SidebarBody } from '../../components/SidebarBody';
import { useDockMetrics } from '../useDockMetrics';

let mockInsets = { top: 0, bottom: 0, left: 0, right: 80 };
let mockFooterHeight = 19;
let mockIsSelecting = false;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));
jest.mock('@/frontend/appShell/layout', () => ({
  useChatDockFooterHeight: () => mockFooterHeight,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  ...jest.requireActual(
    '../../../../../../packages/ui/src/components/composer/utils/composer-dock-layout',
  ),
  ScrollShadow: ({ children }: { children: ReactNode }) => children,
  ScrollInteractionBoundary: ({ children }: { children: (handlers: object) => ReactNode }) =>
    children({}),
}));
jest.mock('../../SidebarSelectionProvider', () => ({
  useSidebarSelectionSnapshot: (select: (state: object) => unknown) =>
    select({ isSelecting: mockIsSelecting, isDeleting: false }),
  useSidebarSelection: () => ({ progress: { get: () => Number(mockIsSelecting) } }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: { View }, useAnimatedStyle: (fn: () => object) => fn() };
});
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: 'light' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#fff' }));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  useChatSource: () => ({ source: 'local', isChatFocused: true }),
}));
jest.mock('@/frontend/appShell/pane/state', () => ({ useFilePane: () => undefined }));
jest.mock('../../context', () => ({ useSidebarActions: () => ({}) }));
jest.mock('../useSidebarDestination', () => ({ useSidebarDestination: () => undefined }));
jest.mock('../useSidebarHeaderTop', () => ({ useSidebarHeaderTop: () => 10 }));
jest.mock('../../components/SidebarNavRow', () => ({ SidebarNavRow: () => null }));
jest.mock('../../components/SidebarRecents', () => ({ SidebarRecents: () => null }));
jest.mock('../../components/SidebarBranchScrollView', () => ({
  SidebarBranchScrollView: (props: object) => {
    const { createElement } = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return createElement(View, { ...props, testID: 'body-scroller' });
  },
}));

describe('useDockMetrics', () => {
  let renderer: ReactTestRenderer;
  let metrics: ReturnType<typeof useDockMetrics>;
  function Probe() {
    metrics = useDockMetrics();
    return null;
  }

  beforeEach(() => {
    mockInsets = { top: 0, bottom: 0, left: 0, right: 80 };
    mockFooterHeight = 19;
    mockIsSelecting = false;
  });
  afterEach(() => act(() => renderer?.unmount()));

  test.each([0, 8, 34])(
    'real composer alignment and selection clearance at bottom inset %s',
    (bottom) => {
      mockInsets.bottom = bottom;
      act(() => {
        renderer = create(<Probe />);
      });
      // Composer: max(inset, 8) + 4 bottom lift + 12 padding + half a 32pt action.
      const composerCenter = Math.max(bottom, 8) + 32;
      const padding = Math.max(bottom, 8) + 10 + 19;
      expect(metrics).toEqual({
        insetStart: 16,
        insetEnd: 16,
        bottomPadding: padding,
        contentHeight: 96,
        normalContentHeight: 96,
        fadeHeight: 16,
        backgroundHeight: padding + 112,
        normalBackgroundHeight: padding + 112,
        selectionBackgroundHeight: padding + 60,
        scrollBottomPadding: padding + 104,
      });
      expect(metrics!.bottomPadding + 22).toBe(composerCenter + 19);
      const normalClearance = metrics!.scrollBottomPadding;
      mockIsSelecting = true;
      act(() => renderer.update(<Probe />));
      expect(metrics!.contentHeight).toBe(44);
      expect(metrics!.normalContentHeight).toBe(96);
      expect(metrics!.backgroundHeight).toBe(padding + 60);
      expect(metrics!.scrollBottomPadding).toBe(padding + 52);
      expect(normalClearance - metrics!.scrollBottomPadding).toBe(52);
      mockIsSelecting = false;
      mockInsets.left = 41;
      act(() => renderer.update(<Probe />));
      expect(metrics!.insetStart).toBe(41);
      expect(metrics!.insetEnd).toBe(16);
      expect(metrics!.contentHeight).toBe(96);
      expect(metrics!.scrollBottomPadding - (padding + 52)).toBe(52);
    },
  );

  test('the real body scroller clears both dock rows, selection, then both rows again', () => {
    mockInsets.bottom = 34;
    act(() => {
      renderer = create(<SidebarBody />);
    });
    const paddingBottom = () =>
      StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'body-scroller' }).props.contentContainerStyle,
      ).paddingBottom;
    // P = 34 + 10 + measured footer 19 = 63.
    expect(paddingBottom()).toBe(63 + 104);
    mockIsSelecting = true;
    act(() => renderer.update(<SidebarBody />));
    expect(paddingBottom()).toBe(63 + 52);
    mockIsSelecting = false;
    act(() => renderer.update(<SidebarBody />));
    expect(paddingBottom()).toBe(63 + 104);
  });
});
