import type { ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenuLink } from '../ContextMenuLink.ios';

let mockLinkProps: { asChild?: boolean; href?: unknown } | undefined;

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ContextMenu: ({ children, items }: { children: ReactElement; items: readonly unknown[] }) =>
      React.createElement(MockView, { items, testID: 'context-menu' }, children),
  };
});

jest.mock('expo-router', () => {
  return {
    Link: ({
      children,
      ...props
    }: {
      asChild?: boolean;
      children: ReactElement;
      href: unknown;
    }) => {
      mockLinkProps = props;
      return children;
    },
  };
});

describe('ContextMenuLink.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockLinkProps = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the route trigger accessible while retaining native context actions', () => {
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenuLink
          href={{ pathname: '/sessions', params: { sessionId: 'session-1' } }}
          items={[
            {
              id: 'delete',
              label: 'Delete',
              onPress: onDelete,
              destructive: true,
            },
          ]}
        >
          <Pressable accessibilityLabel="Session" accessibilityRole="link">
            <Text>Session</Text>
          </Pressable>
        </ContextMenuLink>,
      );
    });

    expect(mockLinkProps?.href).toEqual({
      pathname: '/sessions',
      params: { sessionId: 'session-1' },
    });
    expect(mockLinkProps?.asChild).toBe(true);
    const accessibleRow = renderer!.root.findByProps({ accessibilityLabel: 'Session' });
    expect(accessibleRow.props.accessibilityRole).toBe('link');
    expect(renderer!.root.findByProps({ testID: 'context-menu' }).props.items).toEqual([
      expect.objectContaining({ destructive: true, id: 'delete', onPress: onDelete }),
    ]);
  });
});
