import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MenuContent } from '../menu-content';

const mockOpenChange = jest.fn();

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');
  return { cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')) };
});

jest.mock('heroui-native/popover', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const component = (props: object) => React.createElement(View, props);

  return {
    Popover: { Content: component, Overlay: component, Portal: component },
    usePopover: () => ({ isOpen: true, onOpenChange: mockOpenChange }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 24 }),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/git-fork', () => () => null);

describe('MenuContent', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => mockOpenChange.mockReset());

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('closes before invoking the selected action, including when it throws', () => {
    const order: string[] = [];
    mockOpenChange.mockImplementation(() => order.push('close'));
    const onPress = jest.fn(() => {
      order.push('action');
      throw new Error('Action failed');
    });

    act(() => {
      renderer = create(
        <MenuContent items={[{ destructive: true, id: 'delete', label: 'Delete', onPress }]} />,
      );
    });

    expect(() => renderer!.root.findByType(Pressable).props.onPress()).toThrow('Action failed');
    expect(order).toEqual(['close', 'action']);
    expect(mockOpenChange).toHaveBeenCalledWith(false);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('never dispatches a disabled action or dismisses for it', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MenuContent items={[{ disabled: true, id: 'delete', label: 'Delete', onPress }]} />,
      );
    });

    const item = renderer!.root.findByType(Pressable);
    expect(item.props.disabled).toBe(true);
    act(() => item.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
    expect(mockOpenChange).not.toHaveBeenCalled();
  });

  it('keeps check state controlled by the caller and exposes it to accessibility', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MenuContent items={[{ checked: true, id: 'pin', label: 'Pin', onPress }]} />,
      );
    });

    const item = renderer!.root.findByType(Pressable);
    expect(item.props).toMatchObject({
      accessibilityLabel: 'Pin',
      accessibilityRole: 'checkbox',
      accessibilityState: { checked: true, disabled: false },
    });
    act(() => item.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(item.props.accessibilityState.checked).toBe(true);
  });
});
