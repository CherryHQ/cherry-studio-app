import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ContextMenuLink } from '../ContextMenuLink.ios';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable: MockPressable, View } = jest.requireActual('react-native');

  const Link = Object.assign(
    ({ children, href }: { children: React.ReactNode; href: unknown }) =>
      React.createElement(View, { href, testID: 'link' }, children),
    {
      Menu: ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, { testID: 'link-menu' }, children),
      MenuAction: ({ children, ...props }: { children: React.ReactNode }) =>
        React.createElement(MockPressable, { ...props, testID: `action-${children}` }, children),
      Preview: () => React.createElement(View, { testID: 'link-preview' }),
      Trigger: ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, { testID: 'link-trigger' }, children),
    },
  );

  return { Link };
});

describe('ContextMenuLink.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders a route preview and native context actions', () => {
    const onDelete = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenuLink
          href={{ pathname: '/topics', params: { topicId: 'topic-1' } }}
          items={[
            {
              id: 'delete',
              label: 'Delete',
              onPress: onDelete,
              role: 'destructive',
              systemImage: 'trash',
            },
          ]}
        >
          <Pressable>
            <Text>Topic</Text>
          </Pressable>
        </ContextMenuLink>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'link' }).props.href).toEqual({
      pathname: '/topics',
      params: { topicId: 'topic-1' },
    });
    expect(renderer!.root.findByProps({ testID: 'link-preview' })).toBeTruthy();
    expect(renderer!.root.findByProps({ testID: 'action-Delete' }).props).toMatchObject({
      destructive: true,
      icon: 'trash',
    });

    act(() => renderer!.root.findByProps({ testID: 'action-Delete' }).props.onPress());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
