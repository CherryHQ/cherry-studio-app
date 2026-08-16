import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Switch } from '../switch.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    Toggle: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-toggle' }),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  controlSize: (size: string) => ({ controlSize: size }),
  disabled: (disabled: boolean) => ({ disabled }),
  labelsHidden: () => ({ labelsHidden: true }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('Switch (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the Expo UI Toggle inside its Host with a hidden visual label', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Switch accessibilityLabel="Airplane mode" onValueChange={onValueChange} value />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const toggle = renderer!.root.findByProps({ mockComponent: 'expo-toggle' });

    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.matchContents).toBe(true);
    expect(toggle.props.isOn).toBe(true);
    expect(toggle.props.label).toBe('Airplane mode');
    expect(toggle.props.modifiers).toEqual([
      { labelsHidden: true },
      { controlSize: 'regular' },
      { accessibilityLabel: 'Airplane mode' },
      { disabled: false },
    ]);

    act(() => toggle.props.onIsOnChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  test.each([
    { controlSize: 'small', size: 'sm' },
    { controlSize: 'regular', size: 'default' },
    { controlSize: 'large', size: 'lg' },
  ] as const)('maps $size to the native $controlSize control size', ({ controlSize, size }) => {
    act(() => {
      renderer = create(
        <Switch accessibilityLabel="Airplane mode" onValueChange={jest.fn()} size={size} value />,
      );
    });

    const toggle = renderer!.root.findByProps({ mockComponent: 'expo-toggle' });

    expect(toggle.props.modifiers).toContainEqual({ controlSize });
  });

  test('maps disabled state to the native modifier', () => {
    act(() => {
      renderer = create(
        <Switch
          accessibilityLabel="Airplane mode"
          disabled
          onValueChange={jest.fn()}
          value={false}
        />,
      );
    });

    const toggle = renderer!.root.findByProps({ mockComponent: 'expo-toggle' });

    expect(toggle.props.modifiers).toContainEqual({ disabled: true });
  });
});
