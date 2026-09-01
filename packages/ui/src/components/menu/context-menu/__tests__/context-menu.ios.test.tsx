import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenu } from '../context-menu.ios';

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

describe('ContextMenu.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('presents through the system long-press interaction and dispatches actions', () => {
    const onRename = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: onRename }]}>
          <Pressable testID="row">
            <Text>Row</Text>
          </Pressable>
        </ContextMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.trigger).toBe('longPress');

    // Accessibility for the system interaction is UIKit-owned; the child is not
    // rewritten with custom actions on iOS.
    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toBeUndefined();

    act(() => menu.props.onAction('rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
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
