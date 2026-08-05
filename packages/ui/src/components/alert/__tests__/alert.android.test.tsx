import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Alert } from '../alert.android';

jest.mock('heroui-native', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  function Dialog(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-dialog' });
  }

  Dialog.Portal = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'hero-dialog-portal' });
  Dialog.Overlay = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'hero-dialog-overlay' });
  Dialog.Content = (props: object) =>
    React.createElement(View, { ...props, mockComponent: 'hero-dialog-content' });
  Dialog.Title = (props: object) =>
    React.createElement(Text, { ...props, mockComponent: 'hero-dialog-title' });
  Dialog.Description = (props: object) =>
    React.createElement(Text, { ...props, mockComponent: 'hero-dialog-description' });

  return { Dialog };
});

jest.mock('../../button', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  function Button({ children, ...props }: { children?: React.ReactNode }) {
    return React.createElement(
      Pressable,
      { ...props, mockComponent: 'cherry-button' },
      React.createElement(Text, null, children),
    );
  }

  return { Button };
});

describe('Alert (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the default HeroUI dialog anatomy', () => {
    act(() => {
      renderer = create(
        <Alert
          actions={[{ label: 'OK' }]}
          description="Try again later."
          isOpen
          onOpenChange={jest.fn()}
          testID="connection-alert"
          title="Connection failed"
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-dialog' });

    expect(root.props.isOpen).toBe(true);
    expect(root.props.testID).toBe('connection-alert');
    expect(
      renderer!.root.findByProps({ mockComponent: 'hero-dialog-overlay' }).props.isCloseOnPress,
    ).toBe(false);
    expect(
      renderer!.root.findByProps({ mockComponent: 'hero-dialog-content' }).props.isSwipeable,
    ).toBe(false);
    expect(renderer!.root.findAllByType(Text).map((node) => node.props.children)).toEqual(
      expect.arrayContaining(['Connection failed', 'Try again later.', 'OK']),
    );
  });

  test('invokes an action before closing and maps its role to the Button variant', () => {
    const order: string[] = [];
    const onOpenChange = jest.fn(() => order.push('close'));
    const onPress = jest.fn(() => order.push('action'));

    act(() => {
      renderer = create(
        <Alert
          actions={[{ label: 'Delete', onPress, role: 'destructive' }]}
          isOpen
          onOpenChange={onOpenChange}
          title="Delete?"
        />,
      );
    });

    const button = renderer!.root.findByProps({ mockComponent: 'cherry-button' });

    expect(button.props.size).toBe('sm');
    expect(button.props.variant).toBe('destructive');
    act(() => button.props.onPress());
    expect(order).toEqual(['action', 'close']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
