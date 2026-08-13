import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ProviderApiServiceEndpointField,
  ProviderApiServiceEndpointForm,
} from '../ProviderApiServiceEndpointFields';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');
  const Label = Object.assign(
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Text, props, children),
    {
      Text: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(Text, props, children),
    },
  );

  return {
    Button: ({ children, icon: _icon, ...props }: { children?: React.ReactNode; icon?: unknown }) =>
      React.createElement(Pressable, props, React.createElement(Text, null, children)),
    FieldError: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(Text, null, children),
    Input: TextInput,
    Label,
    TextField: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, testID: 'text-field' }, children),
  };
});

jest.mock('@cherrystudio/app-icons', () => ({
  CheckIcon: () => null,
  SettingsIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ProviderApiServiceEndpointForm', () => {
  let renderer: ReactTestRenderer | undefined;

  const formProps = {
    configuredEndpointTypes: [],
    defaultChatEndpoint: 'openai-chat-completions' as const,
    endpointTypes: ['openai-responses' as const],
    onBaseUrlChange: jest.fn(),
    onBaseUrlCommit: jest.fn(),
    onDefaultChatEndpointChange: jest.fn(),
  };

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the endpoint label row at the default button height before input', () => {
    act(() => {
      renderer = create(
        <ProviderApiServiceEndpointForm
          {...formProps}
          baseUrlByEndpoint={{ 'openai-responses': '' }}
        />,
      );
    });

    const labelRowBeforeInput = renderer?.root.findByProps({
      testID: 'endpoint-label-row-openai-responses',
    });
    const classNameBeforeInput = labelRowBeforeInput?.props.className;

    act(() => {
      renderer?.update(
        <ProviderApiServiceEndpointForm
          {...formProps}
          baseUrlByEndpoint={{ 'openai-responses': '1' }}
        />,
      );
    });

    const labelRowAfterInput = renderer?.root.findByProps({
      testID: 'endpoint-label-row-openai-responses',
    });

    expect(classNameBeforeInput?.split(' ')).toContain('h-9');
    expect(labelRowAfterInput?.props.className).toBe(classNameBeforeInput);
  });

  it('keeps the primary Base URL field editable', () => {
    const onBaseUrlCommit = jest.fn(async () => true);

    act(() => {
      renderer = create(
        <ProviderApiServiceEndpointField
          baseUrl="https://api.example.com"
          onCommit={onBaseUrlCommit}
          onManagePress={jest.fn()}
        />,
      );
    });

    const textField = renderer?.root.findByProps({ testID: 'text-field' });
    const input = renderer?.root.findByType(require('react-native').TextInput);

    expect(textField?.props.isDisabled).not.toBe(true);
    expect(input?.props.onChangeText).toEqual(expect.any(Function));
    expect(input?.props.onBlur).toEqual(expect.any(Function));

    act(() => input?.props.onChangeText('https://next.example.com'));
    const editedInput = renderer?.root.findByType(require('react-native').TextInput);
    expect(editedInput?.props.value).toBe('https://next.example.com');

    act(() => editedInput?.props.onBlur());
    expect(onBaseUrlCommit).toHaveBeenCalledWith('https://next.example.com');
  });

  it('restores the persisted Base URL when saving fails', async () => {
    const onBaseUrlCommit = jest.fn(async () => false);

    act(() => {
      renderer = create(
        <ProviderApiServiceEndpointField
          baseUrl="https://api.example.com"
          onCommit={onBaseUrlCommit}
          onManagePress={jest.fn()}
        />,
      );
    });

    act(() => {
      const input = renderer?.root.findByType(require('react-native').TextInput);
      input?.props.onChangeText('invalid');
    });
    await act(async () => {
      const input = renderer?.root.findByType(require('react-native').TextInput);
      input?.props.onBlur();
      await Promise.resolve();
    });

    const input = renderer?.root.findByType(require('react-native').TextInput);
    expect(input?.props.value).toBe('https://api.example.com');
  });
});
