import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ActionMenu } from '../action-menu';

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

describe('ActionMenu', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('projects flat actions with a tap trigger and dispatches the selected action', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <ActionMenu
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
        >
          <Text>Open</Text>
        </ActionMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });

    expect(menu.props.trigger).toBe('tap');
    expect(menu.props.items).toEqual([
      {
        checked: 'off',
        destructive: false,
        disabled: false,
        icon: 'none',
        id: 'edit',
        label: 'Edit',
      },
      {
        checked: 'on',
        destructive: true,
        disabled: true,
        icon: 'none',
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
        <ActionMenu items={[{ id: 'known', label: 'Known', onPress }]}>
          <Text>Open</Text>
        </ActionMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.items[0].checked).toBe('none');
    expect(menu.props.items[0].icon).toBe('none');

    act(() => menu.props.onAction('missing'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('forwards a semantic icon token so the native view can resolve its artwork', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={[{ icon: 'branch', id: 'fork', label: 'Branch', onPress: jest.fn() }]}>
          <Text>Open</Text>
        </ActionMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.items[0].icon).toBe('branch');
  });

  it('renders its child directly when no items are available', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={[]}>
          <View testID="trigger" />
        </ActionMenu>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'trigger' })).toBeDefined();
    expect(renderer!.root.findAllByProps({ mockComponent: 'native-menu' })).toHaveLength(0);
  });
});
