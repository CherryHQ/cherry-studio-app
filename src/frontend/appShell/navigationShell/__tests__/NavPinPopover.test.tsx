import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { NavPinPopover } from '../NavPinPopover';
import type { NavPinPopoverState } from '../state';

const mockClosePinPopover = jest.fn();
const mockPinTabToDock = jest.fn();
const mockReorderMiddleTab = jest.fn();
const mockUnpinTabFromDock = jest.fn();
let mockPinnedTabs: NavigationPinTabId[];
let mockPopover: NavPinPopoverState | null = { id: 'drawings', source: 'more', x: 100, y: 200 };

jest.mock('@cherrystudio/app-icons/icons/chevron-left', () => 'ChevronLeftIcon');
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => 'ChevronRightIcon');
jest.mock('@cherrystudio/app-icons/icons/pin', () => 'PinIcon');
jest.mock('@cherrystudio/app-icons/icons/pin-off', () => 'PinOffIcon');

jest.mock('@cherrystudio/ui/components', () => ({
  Surface: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => ['#111111', '#666666'],
}));

jest.mock('../state', () => ({
  useNavigationShell: () => ({ pinnedTabs: mockPinnedTabs }),
  useNavigationShellActions: () => ({
    closePinPopover: mockClosePinPopover,
    pinTabToDock: mockPinTabToDock,
    reorderMiddleTab: mockReorderMiddleTab,
    unpinTabFromDock: mockUnpinTabFromDock,
  }),
  useNavigationShellInteraction: () => ({
    popover: mockPopover,
  }),
}));

describe('NavPinPopover opened from More', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockPopover = { id: 'drawings', source: 'more', x: 100, y: 200 };
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  function renderPinButton(pinnedTabs: NavigationPinTabId[]) {
    mockPinnedTabs = pinnedTabs;
    act(() => {
      renderer = create(<NavPinPopover />);
    });
    return renderer!.root.findByProps({ testID: 'nav-popover-pin-drawings' });
  }

  test('uses a transparent resting button and pins the tab before closing', () => {
    const button = renderPinButton(['agents']);

    expect(button.props.className).toContain('active:opacity-70');
    expect(button.props.className).not.toContain('bg-secondary-active');

    act(() => button.props.onPress());
    expect(mockPinTabToDock).toHaveBeenCalledWith('drawings');
    expect(mockClosePinPopover).toHaveBeenCalledTimes(1);
  });

  test('mutes the action text and icon when the dock is full', () => {
    const button = renderPinButton(['agents', 'files', 'plugins']);

    expect(button.props.className).toContain('opacity-60');
    expect(button.props.className).not.toContain('bg-secondary-active');
    expect(button.findByType(Text).props.className).toContain('text-muted-foreground');
    expect(button.findByType('PinIcon' as never).props.color).toBe('#666666');
  });
});

describe('NavPinPopover opened from Dock', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  function renderDockPopover(pinnedTabs: NavigationPinTabId[], id: NavigationPinTabId) {
    mockPinnedTabs = pinnedTabs;
    mockPopover = { id, source: 'dock', x: 160, y: 740 };
    act(() => {
      renderer = create(<NavPinPopover />);
    });
    return renderer!;
  }

  test('renders nothing when the required agents tab is the only middle tab', () => {
    const tree = renderDockPopover(['agents'], 'agents');

    expect(tree.root.findAllByProps({ testID: 'nav-pin-popover' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'nav-pin-popover-backdrop' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'nav-popover-unpin-agents' })).toHaveLength(0);
  });

  test('hides unpin while keeping move-right when agents is first of multiple middle tabs', () => {
    const tree = renderDockPopover(['agents', 'drawings'], 'agents');

    expect(tree.root.findByProps({ testID: 'nav-popover-move-right-agents' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'nav-popover-move-left-agents' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'nav-popover-unpin-agents' })).toHaveLength(0);
  });

  test('hides unpin while keeping move-left when agents is not first', () => {
    const tree = renderDockPopover(['drawings', 'agents'], 'agents');

    expect(tree.root.findByProps({ testID: 'nav-popover-move-left-agents' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'nav-popover-move-right-agents' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'nav-popover-unpin-agents' })).toHaveLength(0);
  });

  test('renders move and unpin actions for removable dock tabs and unpins before closing', () => {
    const tree = renderDockPopover(['agents', 'drawings'], 'drawings');

    expect(tree.root.findByProps({ testID: 'nav-popover-move-left-drawings' })).toBeTruthy();
    const unpinButton = tree.root.findByProps({ testID: 'nav-popover-unpin-drawings' });

    act(() => unpinButton.props.onPress());
    expect(mockUnpinTabFromDock).toHaveBeenCalledWith('drawings');
    expect(mockClosePinPopover).toHaveBeenCalledTimes(1);
  });
});
