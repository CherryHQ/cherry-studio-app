import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Menu } from '../menu';

type NativeMenuProps = {
  children?: ReactNode;
  items: unknown[];
  onAction: (id: string) => void;
  trigger: string;
};

jest.mock('react-native-nitro-modules', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');

  return {
    callback: (value: unknown) => value,
    getHostComponent:
      () =>
      ({ children, ...props }: NativeMenuProps) =>
        React.createElement(NativeView, { ...props, mockComponent: 'native-menu' }, children),
  };
});

describe('Menu', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('projects flat actions to the native view and dispatches the selected action', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <Menu
          items={[
            { checked: false, id: 'edit', label: 'Edit', onPress: onEdit },
            {
              checked: true,
              destructive: true,
              disabled: true,
              id: 'delete',
              label: 'Delete',
              onPress: onDelete,
            },
          ]}
          trigger="longPress"
        >
          <Text>Open</Text>
        </Menu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });

    expect(menu.props.trigger).toBe('longPress');
    expect(menu.props.items).toEqual([
      {
        checked: 'off',
        destructive: false,
        disabled: false,
        id: 'edit',
        label: 'Edit',
      },
      {
        checked: 'on',
        destructive: true,
        disabled: true,
        id: 'delete',
        label: 'Delete',
      },
    ]);

    act(() => menu.props.onAction('delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('uses none for regular actions and ignores unknown native ids', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <Menu items={[{ id: 'known', label: 'Known', onPress }]} trigger="tap">
          <Text>Open</Text>
        </Menu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.items[0].checked).toBe('none');

    act(() => menu.props.onAction('missing'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders its child directly when no items are available', () => {
    act(() => {
      renderer = create(
        <Menu items={[]} trigger="tap">
          <View testID="trigger" />
        </Menu>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'trigger' })).toBeDefined();
    expect(renderer!.root.findAllByProps({ mockComponent: 'native-menu' })).toHaveLength(0);
  });
});
