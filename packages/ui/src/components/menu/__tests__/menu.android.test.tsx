import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Menu } from '../menu.android';

type MockComponentProps = {
  children?: ReactNode;
  className?: string;
};

jest.mock('heroui-native/menu', () => {
  const React = jest.requireActual('react');
  const { Text: NativeText, View } = jest.requireActual('react-native');
  const Passthrough = ({ children }: MockComponentProps) => children;
  const Root = Object.assign(
    ({ children, ...props }: MockComponentProps) =>
      React.createElement(View, { ...props, mockComponent: 'hero-menu' }, children),
    {
      Content: ({ children, className, ...props }: MockComponentProps) =>
        React.createElement(
          View,
          { ...props, mockComponent: 'hero-menu-content', sourceClassName: className },
          children,
        ),
      Item: ({ children, className, ...props }: MockComponentProps) =>
        React.createElement(
          View,
          { ...props, mockComponent: 'hero-menu-item', sourceClassName: className },
          children,
        ),
      ItemTitle: NativeText,
      Overlay: () => null,
      Portal: Passthrough,
      Trigger: Passthrough,
    },
  );

  return { Menu: Root };
});

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: ({ children, ...props }: MockComponentProps) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');

    return React.createElement(View, { ...props, mockComponent: 'expo-menu' }, children);
  },
}));

describe('Menu.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps menu items to a HeroUI popover', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <Menu
          items={[
            { id: 'edit', label: 'Edit', onPress: onEdit, testID: 'edit-action' },
            {
              disabled: true,
              id: 'delete',
              label: 'Delete',
              onPress: onDelete,
              role: 'destructive',
              testID: 'delete-action',
            },
          ]}
          style={{ width: 44 }}
          testID="actions-menu"
        >
          <Text>Open</Text>
        </Menu>,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-menu' });
    const content = renderer!.root.findByProps({ mockComponent: 'hero-menu-content' });
    const edit = renderer!.root.findByProps({ testID: 'edit-action' });
    const remove = renderer!.root.findByProps({ testID: 'delete-action' });

    expect(root.props).toMatchObject({
      presentation: 'popover',
      style: { width: 44 },
      testID: 'actions-menu',
    });
    expect(content.props).toMatchObject({
      align: 'end',
      placement: 'bottom',
      presentation: 'popover',
      width: 210,
    });
    expect(edit.props).toMatchObject({ id: 'edit', isDisabled: undefined, variant: 'default' });
    expect(remove.props).toMatchObject({ id: 'delete', isDisabled: true, variant: 'danger' });
    expect(renderer!.root.findAllByType(Text).map((label) => label.props.children)).toEqual([
      'Open',
      'Edit',
      'Delete',
    ]);

    act(() => edit.props.onPress());
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('uses the native menu for a long-press trigger', () => {
    const onEdit = jest.fn();

    act(() => {
      renderer = create(
        <Menu
          items={[
            {
              id: 'edit',
              isOn: true,
              label: 'Edit',
              onPress: onEdit,
              systemImage: 'pencil',
            },
          ]}
          shouldOpenOnLongPress
          testID="context-menu"
        >
          <Text>Open</Text>
        </Menu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'expo-menu' });
    expect(menu.props).toMatchObject({
      actions: [
        {
          attributes: { destructive: false, disabled: undefined },
          id: 'edit',
          image: 'pencil',
          state: 'on',
          title: 'Edit',
        },
      ],
      shouldOpenOnLongPress: true,
      testID: 'context-menu',
    });

    act(() => menu.props.onPressAction({ nativeEvent: { event: 'edit' } }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
