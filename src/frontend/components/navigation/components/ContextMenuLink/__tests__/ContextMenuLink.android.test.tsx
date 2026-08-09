import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenuLink } from '../ContextMenuLink.android';

jest.mock('@cherrystudio/ui', () => {
  const React = jest.requireActual('react');
  const component = (type: string) => {
    function MockMenuComponent({ children, ...props }: { children?: React.ReactNode }) {
      return React.createElement(type, props, children);
    }

    return MockMenuComponent;
  };

  return {
    ContextMenu: {
      CheckboxItem: component('ContextMenu.CheckboxItem'),
      Content: component('ContextMenu.Content'),
      Item: component('ContextMenu.Item'),
      ItemTitle: component('ContextMenu.ItemTitle'),
      Root: component('ContextMenu.Root'),
      Trigger: component('ContextMenu.Trigger'),
    },
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement, { ...props, testID: 'link' }),
  };
});

describe('ContextMenuLink.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses a normal link with a Zeego context menu', () => {
    const items = [{ id: 'delete', label: 'Delete', onPress: jest.fn() }];

    act(() => {
      renderer = create(
        <ContextMenuLink href="/topics" items={items}>
          <Pressable>
            <Text>Topic</Text>
          </Pressable>
        </ContextMenuLink>,
      );
    });

    expect(renderer!.root.findByType('ContextMenu.Trigger')).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'link' }).props).toMatchObject({
      asChild: true,
      href: '/topics',
    });
  });
});
