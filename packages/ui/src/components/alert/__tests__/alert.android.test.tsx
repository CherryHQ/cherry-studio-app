import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Alert } from '../components/alert/alert.android';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 24 }),
}));

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');

  function Dialog(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-dialog' });
  }

  Dialog.Portal = function Portal(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-dialog-portal' });
  };
  Dialog.Overlay = function Overlay(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-dialog-overlay' });
  };
  Dialog.Content = function Content(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-dialog-content' });
  };
  Dialog.Title = function Title(props: object) {
    return React.createElement(Text, { ...props, mockComponent: 'hero-dialog-title' });
  };
  Dialog.Description = function Description(props: object) {
    return React.createElement(Text, { ...props, mockComponent: 'hero-dialog-description' });
  };

  return { Dialog };
});

jest.mock('../../button', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');

  function Button({ children, ...props }: { children?: React.ReactNode }) {
    return React.createElement(
      Pressable,
      { ...props, mockComponent: 'cherry-button' },
      React.createElement(Text, null, children),
    );
  }

  return { Button };
});

jest.mock('../../input', () => {
  const React = jest.requireActual('react');
  const { TextInput } = jest.requireActual('react-native');

  return {
    Input: (props: object) =>
      React.createElement(TextInput, { ...props, mockComponent: 'cherry-input' }),
  };
});

jest.mock('../../text-field', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    TextField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'cherry-text-field' }),
  };
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

    expect(button.props.size).toBe('default');
    expect(button.props.variant).toBe('destructive');
    act(() => button.props.onPress());
    expect(order).toEqual(['action', 'close']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('renders and controls an optional Cherry UI input', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <Alert
          actions={[{ label: 'Save' }]}
          input={{
            accessibilityLabel: 'Topic name',
            autoFocus: true,
            maxLength: 40,
            onChangeText,
            placeholder: 'Enter a name',
            value: 'New topic',
          }}
          isOpen
          onOpenChange={jest.fn()}
          title="Rename topic"
        />,
      );
    });

    expect(renderer!.root.findByProps({ mockComponent: 'cherry-text-field' })).toBeTruthy();
    const input = renderer!.root.findByProps({ mockComponent: 'cherry-input' });

    expect(input.props.accessibilityLabel).toBe('Topic name');
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.maxLength).toBe(40);
    expect(input.props.placeholder).toBe('Enter a name');
    expect(input.props.value).toBe('New topic');

    act(() => input.props.onChangeText('Updated topic'));
    expect(onChangeText).toHaveBeenCalledWith('Updated topic');
  });
});
