import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SelectField } from '../select-field';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockChevronDownIcon(props: object) {
    return React.createElement(View, { ...props, testID: 'select-chevron' });
  };
});

describe('SelectField', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('composes a field label, value, leading content, and disclosure indicator', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <SelectField accessibilityLabel="Select model" onPress={onPress} testID="model-field">
          <SelectField.Label>Model</SelectField.Label>
          <SelectField.Value>
            <View testID="model-icon" />
            <SelectField.ValueText>Claude</SelectField.ValueText>
          </SelectField.Value>
        </SelectField>,
      );
    });

    const field = renderer!.root.find(
      (node) => node.props.testID === 'model-field' && typeof node.props.className === 'string',
    );
    const value = renderer!.root.find(
      (node) => node.type === Text && node.props.children === 'Claude',
    );

    expect(field.props.accessibilityLabel).toBe('Select model');
    expect(field.props.accessibilityRole).toBe('button');
    expect(field.props.className).toContain('border-border bg-field');
    expect(value.props.className).toContain('text-right text-base text-foreground');
    expect(renderer!.root.findByProps({ testID: 'model-icon' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'select-chevron' })).toBeDefined();

    act(() => field.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('exposes disabled state and custom content without changing field identity', () => {
    act(() => {
      renderer = create(
        <SelectField accessibilityLabel="Unavailable model" disabled onPress={jest.fn()}>
          <Text>Unavailable</Text>
        </SelectField>,
      );
    });

    const field = renderer!.root.find(
      (node) => node.props.accessibilityLabel === 'Unavailable model' && node.type !== SelectField,
    );

    expect(field.props.disabled).toBe(true);
    expect(field.props.accessibilityState).toEqual({ disabled: true });
    expect(field.props.className).toContain('disabled:opacity-40');
  });
});
