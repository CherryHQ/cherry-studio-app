import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NavigationPinTabId } from '@/shared/data/preference/preferenceSchema';

import { NavPinPopover } from '../NavPinPopover';

const mockClosePinPopover = jest.fn();
const mockPinTabToDock = jest.fn();
let mockPinnedTabs: NavigationPinTabId[];

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
  }),
  useNavigationShellInteraction: () => ({
    popover: { id: 'drawings', source: 'more', x: 100, y: 200 },
  }),
}));

describe('NavPinPopover opened from More', () => {
  let renderer: ReactTestRenderer | undefined;

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
