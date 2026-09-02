import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SwitchControl } from '../switch-control.android';

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const native = jest.requireActual('react-native');

  return Object.defineProperty(Object.create(native), 'Switch', {
    value: (props: object) =>
      React.createElement(native.View, { ...props, mockComponent: 'native-switch' }),
  });
});

describe('SwitchControl (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled Android switch with native accessibility', () => {
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

    const control = renderer!.root.findByProps({ mockComponent: 'native-switch' });

    expect(control.props).toMatchObject({
      accessibilityLabel: 'Airplane mode',
      accessibilityRole: 'switch',
      accessibilityState: { checked: true, disabled: false },
      disabled: false,
      testID: 'airplane-mode',
      value: true,
    });

    act(() => control.props.onValueChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  test.each([
    { scale: 0.8, size: 'sm' },
    { scale: 1.15, size: 'lg' },
  ] as const)('maps $size to a scaled native control', ({ scale, size }) => {
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

    expect(renderer!.root.findByProps({ mockComponent: 'native-switch' }).props.style).toEqual([
      { transform: [{ scale }] },
      undefined,
    ]);
  });

  test('hides a presentational indicator from accessibility and interaction', () => {
    act(() => {
      renderer = create(
        <SwitchControl
          accessibilityElementsHidden
          disabled
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          value={false}
        />,
      );
    });

    expect(renderer!.root.findByProps({ mockComponent: 'native-switch' }).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      onValueChange: undefined,
      pointerEvents: 'none',
    });
  });
});
