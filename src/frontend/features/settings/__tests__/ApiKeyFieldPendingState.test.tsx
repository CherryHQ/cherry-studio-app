import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderApiServiceApiKeyForm } from '../ProviderScreen/apiService/components/ProviderApiServiceApiKeyFields';
import { WebSearchApiServiceApiKeyForm } from '../WebSearchScreen/apiService/components/WebSearchApiServiceApiKeyFields';
import type { WebSearchApiKeyEntry } from '../WebSearchScreen/apiService/utils/webSearchApiServiceApiKeys';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

jest.mock('lucide-uniwind/png', () => ({
  CopyIcon: () => null,
  KeyRoundIcon: () => null,
  PlusIcon: () => null,
  Trash2Icon: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');

  return {
    Button: (props: { children?: ReactNode }) => <MockPressable {...props} />,
    FieldError: (props: { children?: ReactNode }) => <MockText {...props} />,
    Input: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    Label: (props: { children?: ReactNode }) => <MockText {...props} />,
    SecureInput: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    Switch: (props: Record<string, unknown>) => <MockPressable {...props} />,
    TextField: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props} mockComponent="text-field">
        {children}
      </MockView>
    ),
  };
});

describe('pending API key fields', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps a provider API key field interactive while its actions are pending', () => {
    const apiKey: ApiKeyEntry = { id: 'key-a', isEnabled: true, key: 'sk-a' };

    act(() => {
      renderer = create(
        <ProviderApiServiceApiKeyForm
          apiKeys={[apiKey]}
          pendingApiKeyIds={new Set([apiKey.id])}
          onAdd={jest.fn()}
          onCommitKey={jest.fn()}
          onEnabledChange={jest.fn()}
          onKeyChange={jest.fn()}
          onRemove={jest.fn()}
        />,
      );
    });

    expect(textField().props.isDisabled).toBe(false);
  });

  it('keeps a web search API key field interactive while its actions are pending', () => {
    const apiKey: WebSearchApiKeyEntry = { id: 'key-a', isNew: false, key: 'key-a' };

    act(() => {
      renderer = create(
        <WebSearchApiServiceApiKeyForm
          apiKeys={[apiKey]}
          pendingApiKeyIds={new Set([apiKey.id])}
          onAdd={jest.fn()}
          onCommitKey={jest.fn()}
          onKeyChange={jest.fn()}
          onRemove={jest.fn()}
        />,
      );
    });

    expect(textField().props.isDisabled).toBeUndefined();
  });

  function textField() {
    return renderer!.root.findByProps({ mockComponent: 'text-field' });
  }
});
