import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Alert } from '../alert.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { Text: NativeText, View } = require('react-native');

  function Alert(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'expo-alert' });
  }

  Alert.Trigger = (props: object) => React.createElement(View, props);
  Alert.Actions = (props: object) => React.createElement(View, props);
  Alert.Message = (props: object) => React.createElement(View, props);

  return {
    Alert,
    Button: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-button' }),
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    Spacer: (props: object) => React.createElement(View, props),
    Text: (props: object) => React.createElement(NativeText, props),
  };
});

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('Alert (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('maps presentation, content, and action roles to Expo Alert', () => {
    const onOpenChange = jest.fn();
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <Alert
          actions={[{ label: 'Delete', onPress, role: 'destructive' }]}
          description="This cannot be undone."
          isOpen
          onOpenChange={onOpenChange}
          testID="delete-alert"
          title="Delete?"
        />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const alert = renderer!.root.findByProps({ mockComponent: 'expo-alert' });
    const button = renderer!.root.findByProps({ mockComponent: 'expo-button' });

    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.matchContents).toBe(true);
    expect(alert.props.isPresented).toBe(true);
    expect(alert.props.title).toBe('Delete?');
    expect(alert.props.testID).toBe('delete-alert');
    expect(button.props.label).toBe('Delete');
    expect(button.props.role).toBe('destructive');
    expect(button.props.onPress).toBe(onPress);

    act(() => alert.props.onIsPresentedChange(false));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
