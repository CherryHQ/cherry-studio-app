import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderApiServiceApiKeysField } from '../ProviderScreen/apiService/components/ProviderApiServiceApiKeyFields';
import { WebSearchApiServiceApiKeysField } from '../WebSearchScreen/apiService/components/WebSearchApiServiceApiKeyFields';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

jest.mock('lucide-uniwind/png', () => ({
  ActivityIcon: () => null,
  CopyIcon: () => null,
  KeyRoundIcon: () => null,
  PlusIcon: () => null,
  Trash2Icon: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const {
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');

  const Label = (props: { children?: ReactNode }) => <MockText {...props} />;
  Label.Text = function LabelText(props: { children?: ReactNode }) {
    return <MockText {...props} />;
  };

  return {
    Button: (props: { children?: ReactNode }) =>
      React.createElement('MockButton', { ...props, mockComponent: 'button' }),
    FieldError: (props: { children?: ReactNode }) => <MockText {...props} />,
    Input: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    Label,
    SecureInput: (props: Record<string, unknown>) => (
      <MockTextInput {...props} mockComponent="secure-input" />
    ),
    Switch: (props: Record<string, unknown>) => React.createElement('MockSwitch', props),
    TextField: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props} mockComponent="text-field">
        {children}
      </MockView>
    ),
  };
});

describe('API key visibility fields', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses the inline SecureInput action without blurring provider API keys', () => {
    act(() => {
      renderer = create(
        <ProviderApiServiceApiKeysField
          apiKeysInput="provider-secret"
          onCommit={jest.fn()}
          onManagePress={jest.fn()}
        />,
      );
    });

    expect(secureInput().props).toEqual(
      expect.objectContaining({
        value: 'provider-secret',
        visibilityAccessibilityLabels: {
          hide: 'settings.provider.apiService.hideApiKeys',
          show: 'settings.provider.apiService.showApiKeys',
        },
      }),
    );
    expect(secureInput().props.blurOnVisibilityToggle).toBeUndefined();
    expect(externalButtons()).toHaveLength(1);
    expect(externalButtons()[0].props.accessibilityLabel).toBe(
      'settings.provider.apiService.manageApiKeys',
    );
  });

  it('keeps Web Search blur-to-commit behavior on the inline visibility action', () => {
    act(() => {
      renderer = create(
        <WebSearchApiServiceApiKeysField
          apiKeysInput="web-search-secret"
          isChecking={false}
          onApiKeysInputChange={jest.fn()}
          onCheck={jest.fn()}
          onManagePress={jest.fn()}
        />,
      );
    });

    expect(secureInput().props).toEqual(
      expect.objectContaining({
        blurOnVisibilityToggle: true,
        value: 'web-search-secret',
        visibilityAccessibilityLabels: {
          hide: 'settings.websearch.provider.hideApiKeys',
          show: 'settings.websearch.provider.showApiKeys',
        },
      }),
    );
    // The visibility action is the one that moved inside the field; the check
    // this screen runs against the key is still a button of its own beside it.
    expect(externalButtons().map((button) => button.props.accessibilityLabel)).toEqual([
      'settings.websearch.provider.manageApiKeys',
      'settings.websearch.provider.check',
    ]);
  });

  function secureInput() {
    return renderer!.root.findByProps({ mockComponent: 'secure-input' });
  }

  function externalButtons() {
    return renderer!.root.findAllByProps({ mockComponent: 'button' });
  }
});
