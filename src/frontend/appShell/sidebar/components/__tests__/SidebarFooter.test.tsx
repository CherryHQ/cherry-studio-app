import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { SidebarFade } from '../SidebarFade/SidebarFade';
import { SidebarFooter } from '../SidebarFooter';

let mockIsSelecting = false;
let mockProgress = 0;
let mockIsDeleting = false;
let mockDestination = 'settings';
let mockTheme = 'light';
const initialPlatform = Platform.OS;
const mockStartNewChat = jest.fn();
const mockOpenSettings = jest.fn();
const mockExit = jest.fn();
const mockDelete = jest.fn();
const mockTranslate = (key: string) => (key === 'navigation.newChat' ? 'Nouvelle discussion' : key);

jest.mock('react-native-gesture-handler', () => ({
  Pressable: ({
    children,
    ...props
  }: {
    children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  }) => {
    const { createElement } = jest.requireActual('react');
    return createElement(
      'DockPressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    );
  },
}));
jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 25, right: 90 }),
}));
jest.mock('@/frontend/appShell/layout', () => ({ useChatDockFooterHeight: () => 19 }));
jest.mock('@cherrystudio/ui/components', () => ({
  ...jest.requireActual(
    '../../../../../../packages/ui/src/components/composer/utils/composer-dock-layout',
  ),
  Spinner: () => null,
  Surface: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => number) => ({ get: fn }),
  };
});
jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: mockTheme }),
  useResolveClassNames: (className: string) => ({
    backgroundColor: className === 'bg-sidebar/0' ? 'rgba(24,24,24,0)' : 'rgba(255,255,255,0)',
  }),
}));
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: (name: string) => (name === 'sidebar' ? '#181818' : '#fff'),
}));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => ['  Cherry  '] }));
jest.mock('@/frontend/components/Avatar', () => ({ ProfileAvatarImage: () => null }));
jest.mock('../SidebarPlanBadge', () => ({ SidebarPlanBadge: () => null }));
jest.mock('../SidebarFade/SidebarFade', () => jest.requireActual('../SidebarFade/SidebarFade.ios'));
jest.mock('expo-blur', () => ({ BlurView: 'DockBlur' }));
jest.mock('../../context', () => ({
  useSidebarActions: () => ({ startNewChat: mockStartNewChat, openSettings: mockOpenSettings }),
}));
jest.mock('../../hooks/useSidebarDestination', () => ({
  useSidebarDestination: () => mockDestination,
}));
jest.mock('../../SidebarSelectionProvider', () => ({
  useSidebarSelectionSnapshot: (select: (state: object) => unknown) =>
    select({
      isSelecting: mockIsSelecting,
      isDeleting: mockIsDeleting,
      selectedIds: new Set(['one']),
    }),
  useSidebarSelection: () => ({
    progress: { get: () => mockProgress },
    exit: mockExit,
    requestDelete: mockDelete,
  }),
}));

describe('SidebarFooter', () => {
  let renderer: ReactTestRenderer;
  const style = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style);
  const control = (testID: string) =>
    renderer.root.findAllByType(Pressable).find((node) => node.props.testID === testID)!;
  function ancestor(node: ReactTestInstance, predicate: (parent: ReactTestInstance) => boolean) {
    let parent = node.parent;
    while (parent && !predicate(parent)) parent = parent.parent;
    if (!parent) throw new Error('Missing dock frame');
    return parent;
  }
  const normalFrame = () =>
    ancestor(control('sidebar-settings'), (node) => node.props.pointerEvents !== undefined);
  const contentFrame = () =>
    ancestor(
      normalFrame(),
      (node) =>
        node.props.accessibilityElementsHidden === undefined &&
        typeof style(node)?.height === 'number',
    );
  const background = () => renderer.root.findByType(LinearGradient).parent!;
  const outer = () =>
    renderer.root.findAllByType(View).find((node) => node.props.pointerEvents === 'box-none')!;
  function render() {
    act(() => {
      renderer = create(<SidebarFooter />);
    });
  }
  function update() {
    act(() => renderer.update(<SidebarFooter />));
  }

  beforeEach(() => {
    expect(Platform.OS).toBe(initialPlatform);
    jest.clearAllMocks();
    mockIsSelecting = false;
    mockProgress = 0;
    mockIsDeleting = false;
    mockDestination = 'settings';
    mockTheme = 'light';
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  test('translated creation button precedes the intact selected profile', () => {
    render();
    const newChat = control('sidebar-new-chat');
    expect(newChat).toBeDefined();
    expect(newChat.props.accessibilityRole).toBe('button');
    expect(newChat.props.accessibilityLabel).toBe('Nouvelle discussion');
    expect(newChat.props.accessibilityState).toEqual({ disabled: false });
    expect(newChat.findByType(Text).props.children).toBe('Nouvelle discussion');
    expect(newChat.findByType(Text).props.numberOfLines).toBe(1);
    expect(newChat.findByType(Text).props.ellipsizeMode).toBe('tail');
    expect(
      normalFrame()
        .findAllByType(Pressable)
        .map((node) => node.props.testID),
    ).toEqual(['sidebar-new-chat', 'sidebar-settings']);
    expect(control('sidebar-settings').props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    act(() => newChat.props.onPress());
    expect(mockStartNewChat.mock.calls).toEqual([[]]);
    act(() => control('sidebar-settings').props.onPress());
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(control('sidebar-settings').findByType(Text).props.children).toBe('Cherry');
  });

  test.each([
    [false, 0],
    [true, 0],
    [true, 0.2],
    [true, 0.5],
    [true, 0.7],
    [true, 0.9],
    [true, 1],
    [false, 0.2],
    [false, 0.5],
    [false, 0.7],
    [false, 0.9],
    [false, 1],
  ] as const)(
    'computed background, rows and bottom anchoring (selection=%s, progress=%s)',
    (selecting, progress) => {
      mockIsSelecting = selecting;
      mockProgress = progress;
      render();
      const padding = 63; // bottom inset 34 + 10 + measured footer 19
      const height = selecting ? 44 : 96;
      expect(style(outer())).toMatchObject({
        paddingBottom: padding,
        paddingStart: 25,
        paddingEnd: 16,
      });
      if (progress <= 0.4) expect(style(background()).height).toBe(padding + 112);
      if (progress === 1) expect(style(background()).height).toBe(padding + 60);
      expect(style(background()).height).toBeGreaterThanOrEqual(padding + 60);
      expect(style(background()).height).toBeLessThanOrEqual(padding + 112);
      expect(background().props.pointerEvents).toBe('none');
      expect(background().props.className).toContain('right-0 bottom-0 left-0');
      const normal = normalFrame();
      expect(style(contentFrame()).height).toBe(height);
      expect(style(normal).gap).toBe(8);
      expect(style(normal).height).toBe(96);
      expect(normal.props.className).toContain('absolute right-0 bottom-0 left-0');
      expect(normal.props.className).not.toContain('inset-0');
      expect(style(normal).opacity).toBe(Math.max(0, 1 - 2 * progress));
      expect(style(normal).transform).toEqual([{ translateY: -8 * progress }]);
      expect(style(control('sidebar-new-chat')).height).toBe(44);
      expect(style(control('sidebar-settings')).height).toBe(44);
      // Normal flow: second row ends at P, first row ends 44 + gap above P.
      if (!selecting) {
        expect(
          style(contentFrame()).height -
            style(control('sidebar-settings')).height -
            style(normal).gap,
        ).toBe(44);
        expect(padding + 44 / 2).toBe(85);
        expect(padding + 44 + style(normal).gap).toBe(115);
      }
      const cancel = control('sidebar-cancel-selection');
      const overlay = ancestor(cancel, (node) => node.props.pointerEvents !== undefined);
      expect(overlay.props.className).toContain('bottom-0');
      expect(overlay.props.className).not.toContain('inset-0');
      expect(style(overlay).height).toBe(44);
      expect(cancel.props.style({ pressed: false }).height).toBe(44);
      expect(control('sidebar-delete-selected').props.style({ pressed: false }).height).toBe(44);
    },
  );

  test.each([true, false])(
    'backdrop covers visible rows in both directions (selection=%s)',
    (selecting) => {
      mockIsSelecting = selecting;
      render();
      // Check the reviewer's uncovered midpoint before the remaining progress samples.
      mockProgress = 0.5;
      update();
      if (style(normalFrame()).opacity > 0)
        expect(style(background()).height).toBeGreaterThanOrEqual(63 + 104 - 8 * mockProgress);
      const samples = [0, 0.2, 0.45, 0.5, 0.7, 0.9, 1];
      if (!selecting) samples.reverse();
      let previousHeight = selecting ? 63 + 112 : 63 + 60;
      for (const progress of samples) {
        mockProgress = progress;
        update();
        const height = style(background()).height;
        if (style(normalFrame()).opacity > 0)
          expect(height).toBeGreaterThanOrEqual(63 + 104 - 8 * progress);
        if (selecting) expect(height).toBeLessThanOrEqual(previousHeight);
        else expect(height).toBeGreaterThanOrEqual(previousHeight);
        if (progress === 0) expect(height).toBe(63 + 112);
        if (progress === 1) expect(height).toBe(63 + 60);
        const opacity = style(normalFrame()).opacity;
        mockProgress = progress === 1 ? progress - 0.000001 : progress + 0.000001;
        update();
        expect(Math.abs(style(background()).height - height)).toBeLessThan(0.001);
        expect(Math.abs(style(normalFrame()).opacity - opacity)).toBeLessThan(0.001);
        previousHeight = height;
      }
    },
  );

  test.each([
    ['ios', 'light'],
    ['ios', 'dark'],
    ['android', 'light'],
    ['android', 'dark'],
  ] as const)('static gradient stays at the backdrop top on %s in %s theme', (os, theme) => {
    jest.replaceProperty(Platform, 'OS', os);
    mockTheme = theme;
    const surface = theme === 'dark' ? '#181818' : '#fff';
    render();
    for (const selecting of [true, false]) {
      mockIsSelecting = selecting;
      for (const progress of [0, 0.2, 0.5, 0.7, 0.9, 1]) {
        mockProgress = progress;
        update();
        const gradient = renderer.root.findByType(LinearGradient);
        expect(Object.keys(style(background()))).toEqual(['height']);
        expect(gradient.props.animatedProps).toBeUndefined();
        // Expo's omitted locations space these two colors evenly from 0 to 1.
        expect(gradient.props.locations).toBeUndefined();
        expect(gradient.props.start).toBeUndefined(); // default: top centre
        expect(gradient.props.end).toBeUndefined(); // default: bottom centre
        expect(style(gradient)).toEqual({
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          height: 16,
          opacity: 0.9,
        });
        const fill = background()
          .findAllByType(View)
          .find((node) => style(node)?.backgroundColor);
        expect(fill).toBeDefined();
        expect(style(fill!)).toEqual({
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          top: 16,
          backgroundColor: surface,
          opacity: 0.9,
        });
        expect(gradient.props.colors).toEqual([
          os === 'ios'
            ? theme === 'dark'
              ? 'rgba(24,24,24,0)'
              : 'rgba(255,255,255,0)'
            : 'transparent',
          surface,
        ]);
      }
    }
  });

  test('iOS blur follows the backdrop continuously without animation completion callbacks', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    render();
    function geometry() {
      const fade = renderer.root.findByType(SidebarFade);
      const frame = fade.parent!;
      const frameStyle = style(frame);
      const translateY = frameStyle?.transform?.[0]?.translateY ?? 0;
      const scaleY = frameStyle?.transform?.[1]?.scaleY ?? 1;
      const height = fade.props.size * scaleY;
      // RN scales around the centre; translation must keep the bottom at zero.
      const bottom = (height - fade.props.size) / 2 + translateY;
      expect(frame.props.className).toContain('absolute right-0 bottom-0 left-0');
      expect(background().props.className).toContain('overflow-hidden');
      expect(bottom).toBeCloseTo(0);
      const bands = fade.findAllByType(BlurView).map((band) => {
        expect(band.props.intensity).toBe(9);
        expect(band.props.animatedProps).toBeUndefined();
        expect(style(band).bottom).toBe(0);
        return style(band).height * scaleY;
      });
      [1, 0.72, 0.46, 0.22].forEach((ratio, index) => {
        expect(bands[index]).toBeCloseTo(height * ratio);
      });
      expect(height).toBeCloseTo(style(background()).height);
      return { height, bottom, bands };
    }
    mockProgress = 0.4;
    update();
    const fixed = geometry();
    for (const selecting of [true, false]) {
      mockIsSelecting = selecting;
      update();
      expect(geometry()).toEqual(fixed);
    }
    // Progress is supplied directly; the mock has no animation or completion callback.
    for (const progress of [0, 1, 0.5]) {
      mockProgress = progress;
      update();
      const { height } = geometry();
      if (progress === 0) expect(height).toBe(175);
      else if (progress === 1) expect(height).toBe(123);
      else {
        expect(height).toBeGreaterThan(123);
        expect(height).toBeLessThan(175);
      }
    }
    // Reverse an unfinished transition and check every step and local continuity.
    mockIsSelecting = true;
    mockProgress = 0.7;
    update();
    const interrupted = geometry();
    mockIsSelecting = false;
    update();
    expect(geometry()).toEqual(interrupted);
    let previous = interrupted.height;
    for (const progress of [0.7, 0.6, 0.5, 0.4, 0.3]) {
      mockProgress = progress;
      update();
      const current = geometry();
      expect(current.height).toBeGreaterThanOrEqual(previous);
      mockProgress = progress - 0.000001;
      update();
      expect(Math.abs(geometry().height - current.height)).toBeLessThan(0.001);
      previous = current.height;
    }
  });

  test.each(['ios', 'android'] as const)(
    'selection hides both rows from touch and accessibility on %s',
    (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      render();
      mockIsSelecting = true;
      update();
      expect(normalFrame().props.accessibilityElementsHidden).toBe(true);
      expect(normalFrame().props.importantForAccessibility).toBe('no-hide-descendants');
      expect(normalFrame().props.pointerEvents).toBe('none');
      for (const id of ['sidebar-new-chat', 'sidebar-settings']) {
        expect(control(id).props.disabled).toBe(true);
        expect(control(id).props.accessibilityState.disabled).toBe(true);
      }
      mockIsSelecting = false;
      mockIsDeleting = true;
      update();
      expect(normalFrame().props.pointerEvents).toBe('box-none');
      expect(normalFrame().props.accessibilityElementsHidden).toBe(false);
      expect(control('sidebar-new-chat').props.disabled).toBe(true);
      expect(control('sidebar-new-chat').props.accessibilityState).toEqual({ disabled: true });
      expect(control('sidebar-settings').props.accessibilityState).toEqual({
        disabled: true,
        selected: true,
      });
    },
  );
});
