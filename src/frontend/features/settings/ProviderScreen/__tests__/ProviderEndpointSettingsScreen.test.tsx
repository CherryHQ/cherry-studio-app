import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { EndpointConfigs, Provider } from '@cherrystudio/universal/data/types/provider';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProviderEndpointSettingsScreen from '../ProviderEndpointSettingsScreen';

type EndpointFormProps = {
  baseUrlByEndpoint: Partial<Record<EndpointType, string>>;
  onBaseUrlCommit: (endpoint: EndpointType, value: string) => void;
};

const provider = {
  authType: 'api-key',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {
    'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
  },
  id: 'provider-1',
  isEnabled: true,
  name: 'Provider One',
} as unknown as Provider;

let mockEndpointFormProps: EndpointFormProps | undefined;
const mockSaveEndpointConfigs = jest.fn<
  Promise<unknown>,
  [{ defaultChatEndpoint: EndpointType; endpointConfigs: EndpointConfigs }]
>();

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useLocalSearchParams: () => ({ providerId: 'provider-1' }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../apiService', () => ({
  ...jest.requireActual('../apiService/utils/providerApiServiceDirtyState'),
  ...jest.requireActual('../apiService/utils/providerApiServiceEndpointRules'),
  ...jest.requireActual('../apiService/utils/providerApiServiceSave'),
  ...jest.requireActual('../apiService/hooks/useProviderApiServiceEndpointDraft'),
  ProviderApiServiceEndpointForm: (props: EndpointFormProps) => {
    mockEndpointFormProps = props;
    return null;
  },
  useProviderApiServiceQueries: () => ({
    provider,
    providerQuery: { isError: false },
    saveProviderMutation: { mutateAsync: mockSaveEndpointConfigs },
  }),
  useProviderApiServiceSheetClose: () => ({ requestClose: jest.fn() }),
}));

describe('ProviderEndpointSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function endpointForm() {
    if (!mockEndpointFormProps) {
      throw new Error('The endpoint form was not rendered.');
    }

    return mockEndpointFormProps;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointFormProps = undefined;
    mockSaveEndpointConfigs.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('does not save an unchanged endpoint URL when editing ends', async () => {
    act(() => {
      renderer = create(<ProviderEndpointSettingsScreen />);
    });

    await act(async () => {
      endpointForm().onBaseUrlCommit('openai-chat-completions', 'https://chat.example.com');
      await Promise.resolve();
    });

    expect(mockSaveEndpointConfigs).not.toHaveBeenCalled();
  });

  it('keeps the endpoint form interactive while a changed URL is saved', async () => {
    const saving = deferred<unknown>();
    mockSaveEndpointConfigs.mockReturnValueOnce(saving.promise);
    act(() => {
      renderer = create(<ProviderEndpointSettingsScreen />);
    });

    act(() => {
      endpointForm().onBaseUrlCommit('openai-chat-completions', 'https://next.example.com');
    });

    expect(mockEndpointFormProps).not.toHaveProperty('pendingEndpoint');

    await act(async () => {
      saving.resolve(undefined);
      await saving.promise;
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
