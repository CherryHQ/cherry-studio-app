import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SwitchControl } from '../switch-control.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    Toggle: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-toggle' }),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityHidden: () => ({ accessibilityHidden: true }),
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  controlSize: (size: string) => ({ controlSize: size }),
  disabled: (disabled: boolean) => ({ disabled }),
  labelsHidden: () => ({ labelsHidden: true }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('SwitchControl (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled SwiftUI toggle with native accessibility', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <SwitchControl
          accessibilityLabel="Airplane mode"
          onValueChange={onValueChange}
          testID="airplane-mode"
          value
        />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const toggle = renderer!.root.findByProps({ mockComponent: 'expo-toggle' });

    expect(host.props).toMatchObject({
      colorScheme: 'dark',
      ignoreSafeArea: 'all',
      matchContents: true,
      testID: 'airplane-mode-host',
    });
    expect(toggle.props).toMatchObject({
      isOn: true,
      label: 'Airplane mode',
      testID: 'airplane-mode',
    });
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
  ] as const)('maps $size to the native $controlSize size', ({ controlSize, size }) => {
    act(() => {
      renderer = create(
        <SwitchControl
          accessibilityLabel="Airplane mode"
          onValueChange={jest.fn()}
          size={size}
          value
        />,
      );
    });

    expect(
      renderer!.root.findByProps({ mockComponent: 'expo-toggle' }).props.modifiers,
    ).toContainEqual({ controlSize });
  });

  test('hides a presentational indicator from accessibility and interaction', () => {
    act(() => {
      renderer = create(
        <SwitchControl accessibilityElementsHidden disabled pointerEvents="none" value={false} />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const toggle = renderer!.root.findByProps({ mockComponent: 'expo-toggle' });

    expect(host.props.pointerEvents).toBe('none');
    expect(toggle.props.onIsOnChange).toBeUndefined();
    expect(toggle.props.modifiers).toEqual([
      { labelsHidden: true },
      { controlSize: 'regular' },
      { accessibilityHidden: true },
      { disabled: true },
    ]);
  });
});
