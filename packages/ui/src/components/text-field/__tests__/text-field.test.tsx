import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TextField } from '../text-field';

jest.mock('heroui-native/text-field', () => {
  const React = jest.requireActual('react');

  return {
    TextField: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('hero-text-field', props, children),
  };
});

jest.mock('heroui-native/label', () => {
  const React = jest.requireActual('react');

  return {
    Label: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('hero-label', props, children),
  };
});

jest.mock('heroui-native/description', () => {
  const React = jest.requireActual('react');

  return {
    Description: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('hero-description', props, children),
  };
});

jest.mock('heroui-native/field-error', () => {
  const React = jest.requireActual('react');

  return {
    FieldError: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('hero-field-error', props, children),
  };
});

describe('TextField', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps Cherry field state to the private provider contract', () => {
    act(() => {
      renderer = create(
        <TextField disabled invalid required testID="field">
          <View testID="content" />
        </TextField>,
      );
    });

    expect(renderer!.root.findByType('hero-text-field').props).toMatchObject({
      isDisabled: true,
      isInvalid: true,
      isRequired: true,
      testID: 'field',
    });
    expect(renderer!.root.findByProps({ testID: 'content' })).toBeDefined();
  });

  it('owns the label, description, and error presentation defaults', () => {
    act(() => {
      renderer = create(
        <TextField>
          <TextField.Label testID="label">API key</TextField.Label>
          <TextField.Description testID="description">Used to authenticate.</TextField.Description>
          <TextField.Error testID="error">API key is required.</TextField.Error>
        </TextField>,
      );
    });

    expect(renderer!.root.findByType('hero-label').props).toMatchObject({
      className: 'text-foreground',
      testID: 'label',
    });
    expect(renderer!.root.findByType('hero-description').props).toMatchObject({
      hideOnInvalid: true,
      testID: 'description',
    });
    expect(renderer!.root.findByType('hero-field-error').props.testID).toBe('error');
  });
});
