import { Pressable, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Switch } from '../switch';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');
  return { cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')) };
});

jest.mock('../switch-control', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    SwitchControl: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'switch-control' }),
  };
});

const { SwitchControl: FallbackSwitchControl } = jest.requireActual('../switch-control.tsx') as {
  SwitchControl: (typeof import('../switch-control'))['SwitchControl'];
};

describe('Switch', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('exposes controlled switch state and requests the opposite value on press', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <FallbackSwitchControl
          accessibilityLabel="Airplane mode"
          onValueChange={onValueChange}
          value
        />,
      );
    });

    const control = renderer!.root.findByType(Pressable);
    expect(control.props).toMatchObject({
      accessibilityLabel: 'Airplane mode',
      accessibilityRole: 'switch',
      accessibilityState: { checked: true, disabled: false },
    });

    act(() => control.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(control.props.accessibilityState.checked).toBe(true);
  });

  test('keeps a disabled indicator hidden from touch and accessibility', () => {
    act(() => {
      renderer = create(
        <FallbackSwitchControl
          accessibilityElementsHidden
          disabled
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          value={false}
        />,
      );
    });

    expect(renderer!.root.findByType(Pressable).props).toMatchObject({
      accessibilityElementsHidden: true,
      accessibilityState: { checked: false, disabled: true },
      disabled: true,
      importantForAccessibility: 'no-hide-descendants',
      onPress: undefined,
      pointerEvents: 'none',
    });
  });

  test('owns the press and keeps the control presentational', () => {
    const onValueChange = jest.fn();
    const stopPropagation = jest.fn();

    act(() => {
      renderer = create(
        <Switch
          accessibilityLabel="Airplane mode"
          onValueChange={onValueChange}
          testID="airplane-mode"
          value
        />,
      );
    });

    const pressOwner = renderer!.root.find(
      (node) =>
        node.props.accessibilityLabel === 'Airplane mode' &&
        node.props.accessibilityRole === 'switch' &&
        typeof node.props.onPress === 'function',
    );
    const control = renderer!.root.findByProps({ mockComponent: 'switch-control' });
    const interactionShield = renderer!.root.find(
      (node) =>
        node.type === View &&
        node.props.accessible === false &&
        node.props.pointerEvents === 'none' &&
        node.props.mockComponent === undefined,
    );

    expect(pressOwner.props).toMatchObject({
      accessibilityState: { checked: true, disabled: false },
      disabled: false,
      hitSlop: 14,
      testID: 'airplane-mode',
    });
    expect(interactionShield.props.accessible).toBe(false);
    expect(control.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
      testID: 'airplane-mode-indicator',
      value: true,
    });
    expect(control.props.onValueChange).toBeUndefined();

    act(() => pressOwner.props.onPress({ stopPropagation }));

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});
