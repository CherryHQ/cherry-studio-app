import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Alert } from '../components/alert/alert.ios';

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
    TextField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-text-field' }),
    useNativeState: (initialValue: string) => {
      const state = React.useRef();

      if (!state.current) {
        let value = initialValue;
        state.current = {
          get: () => value,
          initialValue,
          set: jest.fn((nextValue: string) => {
            value = nextValue;
          }),
        };
      }

      return state.current;
    },
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
}));

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

  test('maps optional input configuration to an Expo TextField', () => {
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

    const input = renderer!.root.findByProps({ mockComponent: 'expo-text-field' });

    expect(input.props.autoFocus).toBe(true);
    expect(input.props.maxLength).toBe(40);
    expect(input.props.modifiers).toEqual([{ accessibilityLabel: 'Topic name' }]);
    expect(input.props.placeholder).toBe('Enter a name');
    expect(input.props.text.initialValue).toBe('New topic');
    expect(input.props.text.set).not.toHaveBeenCalled();

    act(() => input.props.onTextChange('Updated topic'));
    expect(onChangeText).toHaveBeenCalledWith('Updated topic');

    act(() => {
      renderer!.update(
        <Alert
          actions={[{ label: 'Save' }]}
          input={{
            accessibilityLabel: 'Topic name',
            onChangeText,
            value: 'Externally updated topic',
          }}
          isOpen
          onOpenChange={jest.fn()}
          title="Rename topic"
        />,
      );
    });
    expect(input.props.text.set).toHaveBeenCalledWith('Externally updated topic');
  });
});
