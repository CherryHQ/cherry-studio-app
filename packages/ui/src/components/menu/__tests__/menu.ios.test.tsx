import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Menu } from '../menu.ios';

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');

    return React.createElement(View, { ...props, mockComponent: 'expo-menu' }, children);
  },
}));

describe('Menu.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps menu items to Expo UI actions', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <Menu
          items={[
            { id: 'edit', label: 'Edit', onPress: onEdit, systemImage: 'pencil' },
            {
              disabled: true,
              id: 'delete',
              label: 'Delete',
              onPress: onDelete,
              role: 'destructive',
              systemImage: 'trash',
            },
          ]}
          style={{ width: 44 }}
          testID="actions-menu"
        >
          <Text>Open</Text>
        </Menu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'expo-menu' });

    expect(menu.props.style).toEqual({ width: 44 });
    expect(menu.props.testID).toBe('actions-menu');
    expect(menu.props.actions).toEqual([
      {
        attributes: { destructive: false, disabled: undefined },
        id: 'edit',
        image: 'pencil',
        title: 'Edit',
      },
      {
        attributes: { destructive: true, disabled: true },
        id: 'delete',
        image: 'trash',
        title: 'Delete',
      },
    ]);

    act(() => menu.props.onPressAction({ nativeEvent: { event: 'delete' } }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
