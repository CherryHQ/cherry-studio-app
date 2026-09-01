import type { ReactNode } from 'react';
import { type AccessibilityActionEvent, Pressable, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenu } from '../context-menu.android';

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

function accessibilityAction(actionName: string): AccessibilityActionEvent {
  return { nativeEvent: { actionName } } as AccessibilityActionEvent;
}

describe('ContextMenu.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('presents through a long-press native view and dispatches the selected action', () => {
    const onRename = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: onRename }]}>
          <Text>Row</Text>
        </ContextMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.trigger).toBe('longPress');
    expect(menu.props.items).toEqual([
      { checked: 'none', destructive: false, disabled: false, id: 'rename', label: 'Rename' },
    ]);

    act(() => menu.props.onAction('rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('exposes enabled items as accessibility actions on the child and dispatches them', () => {
    const onRename = jest.fn();
    const onDelete = jest.fn();
    const onDisabled = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu
          items={[
            { id: 'rename', label: 'Rename', onPress: onRename },
            { destructive: true, id: 'delete', label: 'Delete', onPress: onDelete },
            { disabled: true, id: 'share', label: 'Share', onPress: onDisabled },
          ]}
        >
          <Pressable testID="row">
            <Text>Row</Text>
          </Pressable>
        </ContextMenu>,
      );
    });

    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toEqual([
      { label: 'Rename', name: 'rename' },
      { label: 'Delete', name: 'delete' },
    ]);

    act(() => row.props.onAccessibilityAction(accessibilityAction('delete')));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();

    act(() => row.props.onAccessibilityAction(accessibilityAction('share')));
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('keeps the child accessibility contract it already declares', () => {
    const onChildAction = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: jest.fn() }]}>
          <Pressable
            accessibilityActions={[{ label: 'Collapse', name: 'collapse' }]}
            onAccessibilityAction={onChildAction}
            testID="row"
          >
            <Text>Row</Text>
          </Pressable>
        </ContextMenu>,
      );
    });

    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toEqual([
      { label: 'Collapse', name: 'collapse' },
      { label: 'Rename', name: 'rename' },
    ]);

    act(() => row.props.onAccessibilityAction(accessibilityAction('collapse')));
    expect(onChildAction).toHaveBeenCalledTimes(1);
  });

  it('renders its child directly when no items are available', () => {
    act(() => {
      renderer = create(
        <ContextMenu items={[]}>
          <View testID="row" />
        </ContextMenu>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'row' })).toBeDefined();
    expect(renderer!.root.findAllByProps({ mockComponent: 'native-menu' })).toHaveLength(0);
  });
});
