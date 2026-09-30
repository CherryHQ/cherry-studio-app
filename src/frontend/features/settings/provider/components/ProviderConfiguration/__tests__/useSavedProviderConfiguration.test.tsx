import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { useSavedProviderConfiguration } from '../hooks/useSavedProviderConfiguration';

const mockProvider = {
  authType: 'api-key',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs: {
    [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://example.com/anthropic' },
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://example.com/v1' },
  },
  id: 'custom',
  isEnabled: true,
  name: 'Custom',
} as Provider;
const followingModel: Model = {
  capabilities: [],
  endpointTypes: [],
  id: createUniqueModelId('custom', 'model'),
  isDeprecated: false,
  isEnabled: true,
  isHidden: false,
  modelId: 'model',
  name: 'Model',
  providerId: 'custom',
  supportsStreaming: true,
};
let mockModels: Model[] = [];
let mockApiKeys: ApiKeyEntry[] = [];
const mockSave = jest.fn();
const mockConfirm = jest.fn();
const mockAlert = jest.fn();
const mockToast = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm, show: mockAlert } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count == null ? key : `${key}:${values.count}`,
  }),
}));
jest.mock('@/frontend/data', () => ({
  queryKeys: jest.requireActual('@/frontend/data/queryKeys').queryKeys,
  useBackendModule: () => ({
    accounts: { getCapabilities: () => ({ apiKeys: false, balance: false, signIn: false }) },
  }),
  useQuery: () => ({ data: mockModels, isError: false, isPending: false }),
}));
jest.mock('../../../apiService/hooks/useProviderApiServiceQueries', () => ({
  useProviderApiServiceQueries: () => ({
    apiKeys: mockApiKeys,
    apiKeysQuery: { isError: false, isPending: false, refetch: jest.fn() },
    authConfig: null,
    authConfigQuery: { isError: false, isPending: false },
    provider: mockProvider,
    providerQuery: { isError: false, isPending: false },
    saveProviderMutation: { mutateAsync: mockSave },
  }),
}));
jest.mock('@/frontend/hooks/useProviderAvatar', () => ({
  useProviderAvatar: () => undefined,
  useProviderAvatarActions: () => ({ persist: jest.fn(), remove: jest.fn() }),
}));

describe('saved provider configuration writes each change', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer;
  let configuration: ReturnType<typeof useSavedProviderConfiguration>;
  function ConfigurationProbe() {
    configuration = useSavedProviderConfiguration('custom');
    return null;
  }
  function Probe() {
    return (
      <QueryClientProvider client={queryClient}>
        <ConfigurationProbe />
      </QueryClientProvider>
    );
  }
  const actions = () => {
    if (!configuration.value) throw new Error('configuration did not load');
    return configuration.value.actions;
  };
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    jest.clearAllMocks();
    mockModels = [followingModel];
    mockApiKeys = [{ id: 'key', isEnabled: true, key: 'sk-test' }];
    mockSave.mockResolvedValue(mockProvider);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    queryClient.clear();
  });

  it('asks before moving the default endpoint that existing models follow', async () => {
    await act(async () => {
      await actions().setDefaultEndpoint(ENDPOINT_TYPE.ANTHROPIC_MESSAGES);
    });
    expect(mockConfirm.mock.calls[0][0].description).toBe(
      'settings.provider.apiService.defaultEndpointChangeMessage:1',
    );
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => {
      mockConfirm.mock.calls[0][0].onConfirm();
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES }),
    );
  });

  it('refuses to clear an endpoint a model explicitly uses', async () => {
    mockModels = [{ ...followingModel, endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES] }];
    act(() => renderer.update(<Probe />));
    let saved = true;
    await act(async () => {
      saved = await actions().setEndpointUrl(ENDPOINT_TYPE.ANTHROPIC_MESSAGES, '');
    });
    expect(saved).toBe(false);
    expect(mockAlert.mock.calls[0][0].description).toBe(
      'settings.provider.apiService.endpointInUseMessage:1',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('writes a rename on its own without touching the keys', async () => {
    await act(async () => {
      await actions().rename(' Renamed ');
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toEqual({ name: 'Renamed' });
  });

  it('writes the whole key list, keeping identities and normalizing edited labels', async () => {
    mockApiKeys = [
      { id: 'a', isEnabled: true, key: 'sk-a', label: 'Primary' },
      { id: 'b', isEnabled: false, key: 'sk-b', label: 'Backup' },
    ];
    act(() => renderer.update(<Probe />));
    await act(async () => {
      await actions().updateApiKey('b', { isEnabled: true, label: ' Work ' });
    });
    expect(mockSave).toHaveBeenCalledWith({
      apiKeys: [
        { id: 'a', isEnabled: true, key: 'sk-a', label: 'Primary' },
        { id: 'b', isEnabled: true, key: 'sk-b', label: 'Work' },
      ],
    });
  });

  it('never writes a duplicate key', async () => {
    let added = true;
    await act(async () => {
      added = await actions().addApiKey({ id: 'copy', isEnabled: true, key: 'sk-test' });
    });
    expect(added).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('reports a failed write and resolves false', async () => {
    mockSave.mockRejectedValue(new Error('write failed'));
    let saved = true;
    await act(async () => {
      saved = await actions().rename('Renamed');
    });
    expect(saved).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
    expect(configuration.value?.isBusy).toBe(false);
  });

  it('holds setup back until an enabled key exists, and says why', () => {
    mockApiKeys = [{ id: 'a', isEnabled: false, key: 'sk-a' }];
    act(() => renderer.update(<Probe />));
    expect(configuration.canContinue).toBe(false);
    expect(configuration.continueHint).toBe('settings.provider.setup.issues.disabled-api-keys');

    mockApiKeys = [{ id: 'a', isEnabled: true, key: 'sk-a' }];
    act(() => renderer.update(<Probe />));
    expect(configuration.canContinue).toBe(true);
    expect(configuration.continueHint).toBeUndefined();
  });
});
