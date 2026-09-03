import type { ReactElement } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  Pressable,
  Text,
} from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenuLink } from '../ContextMenuLink.android';

type AccessibilityProps = {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    ContextMenu: ({ children, items }: { children: ReactElement; items: readonly MenuItem[] }) => {
      const child = children as ReactElement<AccessibilityProps>;
      const actionableItems = items.filter((item) => !item.disabled);

      return React.cloneElement(child, {
        accessibilityActions: actionableItems.map((item) => ({
          label: item.label,
          name: item.id,
        })),
        onAccessibilityAction: (event: AccessibilityActionEvent) => {
          actionableItems.find((item) => item.id === event.nativeEvent.actionName)?.onPress();
        },
      });
    },
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    Link: ({ children, ...props }: { children: ReactElement; href: unknown }) => {
      const child = children as ReactElement<AccessibilityProps>;
      const linkProps = props as AccessibilityProps;
      const childHandler = child.props.onAccessibilityAction;
      const linkHandler = linkProps.onAccessibilityAction;

      return React.cloneElement(child, {
        accessibilityActions: child.props.accessibilityActions ?? linkProps.accessibilityActions,
        onAccessibilityAction: (event: AccessibilityActionEvent) => {
          childHandler?.(event);
          linkHandler?.(event);
        },
      });
    },
  };
});

type MenuItem = {
  disabled?: boolean;
  id: string;
  label: string;
  onPress: () => void;
};

function accessibilityAction(actionName: string): AccessibilityActionEvent {
  return { nativeEvent: { actionName } } as AccessibilityActionEvent;
}

describe('ContextMenuLink.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('gives menu actions one owner while preserving unrelated child actions', () => {
    const onChildAction = jest.fn();
    const onRename = jest.fn();
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenuLink
          href="/sessions"
          items={[
            { id: 'rename', label: 'Rename', onPress: onRename },
            { id: 'delete', label: 'Delete', onPress: onDelete },
            { disabled: true, id: 'share', label: 'Share', onPress: jest.fn() },
          ]}
        >
          <Pressable
            accessibilityActions={[
              { label: 'Collapse', name: 'collapse' },
              { label: 'Legacy rename', name: 'rename' },
              { label: 'Legacy share', name: 'share' },
            ]}
            onAccessibilityAction={onChildAction}
            testID="row"
          >
            <Text>Session</Text>
          </Pressable>
        </ContextMenuLink>,
      );
    });

    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toEqual([
      { label: 'Collapse', name: 'collapse' },
      { label: 'Rename', name: 'rename' },
      { label: 'Delete', name: 'delete' },
    ]);

    act(() => row.props.onAccessibilityAction(accessibilityAction('rename')));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onChildAction).not.toHaveBeenCalled();

    act(() => row.props.onAccessibilityAction(accessibilityAction('collapse')));
    expect(onChildAction).toHaveBeenCalledTimes(1);

    act(() => row.props.onAccessibilityAction(accessibilityAction('delete')));
    expect(onDelete).toHaveBeenCalledTimes(1);

    act(() => row.props.onAccessibilityAction(accessibilityAction('share')));
    expect(onChildAction).toHaveBeenCalledTimes(1);
  });
});
