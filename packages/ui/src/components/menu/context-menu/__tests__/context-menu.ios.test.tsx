import { type ReactNode, useEffect } from 'react';
import { type GestureResponderEvent, Pressable, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenuExclusion } from '../context-menu-exclusion';
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

  it('enables the native menu without remounting streamed content', () => {
    const onMount = jest.fn();
    function Content() {
      useEffect(onMount, []);
      return <Text>Answer</Text>;
    }
    const content = <Content />;
    act(() => {
      renderer = create(<ContextMenu items={[]}>{content}</ContextMenu>);
    });

    expect(renderer!.root.findByProps({ mockComponent: 'native-menu' }).props.items).toEqual([]);
    act(() => {
      renderer?.update(
        <ContextMenu items={[{ id: 'copy', label: 'Copy', onPress: jest.fn() }]}>
          {content}
        </ContextMenu>,
      );
    });
    expect(renderer!.root.findByProps({ mockComponent: 'native-menu' }).props.items).toHaveLength(
      1,
    );
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('withholds native menu items for an excluded touch until the next ordinary touch', () => {
    const onControlTouch = jest.fn();
    const items = [{ id: 'copy', label: 'Copy', onPress: jest.fn() }];
    const content = (
      <View>
        <ContextMenuExclusion onTouchStart={onControlTouch} testID="control">
          <Text>Open details</Text>
        </ContextMenuExclusion>
      </View>
    );
    act(() => {
      renderer = create(<ContextMenu items={items}>{content}</ContextMenu>);
    });

    const anchor = renderer!.root.find(
      (node) => node.type === View && node.props.collapsable === false,
    );
    const control = renderer!.root.find(
      (node) => node.type === View && node.props.testID === 'control',
    );
    const excludedTouch = { nativeEvent: { touches: [{}] } } as GestureResponderEvent;
    act(() => {
      control.props.onTouchStart(excludedTouch);
      anchor.props.onTouchStart(excludedTouch);
    });
    expect(onControlTouch).toHaveBeenCalledWith(excludedTouch);
    expect(renderer!.root.findByProps({ mockComponent: 'native-menu' }).props.items).toEqual([]);

    // A content/action update must not restore a menu during the excluded touch.
    act(() => {
      renderer?.update(<ContextMenu items={[...items]}>{content}</ContextMenu>);
    });
    expect(renderer!.root.findByProps({ mockComponent: 'native-menu' }).props.items).toEqual([]);

    act(() => anchor.props.onTouchStart({ nativeEvent: { touches: [{}] } }));
    expect(renderer!.root.findByProps({ mockComponent: 'native-menu' }).props.items).toHaveLength(
      1,
    );
  });
});
