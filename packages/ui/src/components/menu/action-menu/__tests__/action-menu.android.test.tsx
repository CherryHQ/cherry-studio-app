import { Pressable, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ActionMenu } from '../action-menu.android';

jest.mock('../../menu-content', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    MenuContent: (props: object) => React.createElement(View, { ...props, testID: 'menu-content' }),
  };
});

const anchor = { height: 44, width: 44, x: 12, y: 120 };
(View as unknown as { prototype: Record<string, unknown> }).prototype.measureInWindow = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => callback(anchor.x, anchor.y, anchor.width, anchor.height);

describe('ActionMenu.android', () => {
  let renderer: ReactTestRenderer | undefined;
  const items = [{ id: 'rename', label: 'Rename', onPress: jest.fn() }];

  function findTrigger() {
    return renderer!.root.find(
      (node) =>
        node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    );
  }

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens from the trigger and keeps its anchor until closing finishes', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={items}>
          <View accessibilityLabel="More" accessibilityRole="button" />
        </ActionMenu>,
      );
    });
    const trigger = findTrigger();
    expect(trigger.props.accessibilityLabel).toBe('More');
    expect(trigger.props.accessibilityState.expanded).toBe(false);
    act(() => trigger.props.onPress());
    const menu = renderer!.root.findByProps({ testID: 'menu-content' });
    expect(menu.props.anchor).toEqual({ height: 44, width: 44, pageX: 12, pageY: 120 });
    expect(trigger.props.accessibilityState.expanded).toBe(true);
    act(() => menu.props.onClose());
    expect(menu.props.isOpen).toBe(false);
    expect(trigger.props.accessibilityState.expanded).toBe(false);
    act(() => menu.props.onClosed());
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
  });

  it('does not let completion of an old close remove a reopened menu', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={items}>
          <View />
        </ActionMenu>,
      );
    });
    const trigger = findTrigger();
    act(() => trigger.props.onPress());
    const menu = renderer!.root.findByProps({ testID: 'menu-content' });
    const finishOldClose = menu.props.onClosed;
    act(() => menu.props.onClose());
    act(() => trigger.props.onPress());
    act(() => finishOldClose());
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
  });

  it('does not open a disabled trigger', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={items}>
          <View accessibilityState={{ disabled: true }} />
        </ActionMenu>,
      );
    });
    const trigger = findTrigger();
    expect(trigger.props.disabled).toBe(true);
    act(() => trigger.props.onPress());
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
  });

  it('owns nested button touches and accessibility while preserving trigger preparation', () => {
    const onChildPress = jest.fn();
    const prepare = jest.fn(() => false);
    act(() => {
      renderer = create(
        <ActionMenu items={items}>
          <Pressable
            accessibilityLabel="More"
            onPress={onChildPress}
            onStartShouldSetResponderCapture={prepare}
            testID="nested-button"
          >
            <Text>More</Text>
          </Pressable>
        </ActionMenu>,
      );
    });
    const shield = renderer!.root.find(
      (node) =>
        node.props.pointerEvents === 'none' &&
        node.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(shield.findByProps({ testID: 'nested-button' })).toBeDefined();
    const trigger = findTrigger();
    act(() => {
      trigger.props.onStartShouldSetResponderCapture();
      trigger.props.onPress();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(onChildPress).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
  });

  it('respects a child button disabled prop without requiring duplicated accessibility state', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={items}>
          <Pressable disabled />
        </ActionMenu>,
      );
    });
    const trigger = findTrigger();
    expect(trigger.props.accessibilityState.disabled).toBe(true);
    act(() => trigger.props.onPress());
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
  });

  it('leaves the child untouched when no actions exist', () => {
    act(() => {
      renderer = create(
        <ActionMenu items={[]}>
          <View testID="child" />
        </ActionMenu>,
      );
    });
    expect(renderer!.root.findByProps({ testID: 'child' })).toBeDefined();
    expect(renderer!.root.findAll((node) => typeof node.props.onPress === 'function')).toHaveLength(
      0,
    );
  });
});
