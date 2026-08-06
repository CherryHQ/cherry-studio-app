import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Description, FieldError, Label, TextField } from '../text-field';

jest.mock('heroui-native/text-field', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    TextField: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'hero-text-field' }),
    useTextField: jest.fn(),
  };
});

jest.mock('heroui-native/label', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Label: (props: object) => React.createElement(Text, { ...props, mockComponent: 'hero-label' }),
    useLabel: jest.fn(),
  };
});

jest.mock('heroui-native/description', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Description: (props: object) =>
      React.createElement(Text, { ...props, mockComponent: 'hero-description' }),
  };
});

jest.mock('heroui-native/field-error', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    FieldError: (props: object) =>
      React.createElement(Text, { ...props, mockComponent: 'hero-field-error' }),
  };
});

describe('TextField exports', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('preserves the HeroUI field anatomy and state props', () => {
    act(() => {
      renderer = create(
        <TextField isDisabled isInvalid isRequired testID="email-field">
          <Label>Email</Label>
          <Description>Email is used for your account.</Description>
          <FieldError>Enter a valid email.</FieldError>
        </TextField>,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-text-field' });

    expect(root.props).toEqual(
      expect.objectContaining({
        isDisabled: true,
        isInvalid: true,
        isRequired: true,
        testID: 'email-field',
      }),
    );
    expect(renderer!.root.findByProps({ mockComponent: 'hero-label' }).props.children).toBe(
      'Email',
    );
    expect(renderer!.root.findByProps({ mockComponent: 'hero-description' })).toBeDefined();
    expect(renderer!.root.findByProps({ mockComponent: 'hero-field-error' })).toBeDefined();
  });
});
