import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useProviderConfigurationForm } from '../useProviderConfigurationForm';

const mockProvider = {
  id: 'custom',
  name: 'Custom',
  authType: 'api-key',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs: {
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://example.com/v1' },
    [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: { baseUrl: 'https://example.com/anthropic' },
  },
} as Provider;
const followingModel = { id: createUniqueModelId('custom', 'model'), endpointTypes: [] } as Model;
let mockModels: Model[] = [];
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
  useQuery: () => ({ data: mockModels, isPending: false, isError: false }),
}));
jest.mock('../useProviderApiServiceQueries', () => ({
  useProviderApiServiceQueries: () => ({
    provider: mockProvider,
    apiKeys: [{ id: 'key', key: 'sk-test', isEnabled: true }],
    authConfig: null,
    providerQuery: { isPending: false, isError: false },
    apiKeysQuery: { isPending: false, isError: false },
    authConfigQuery: { isPending: false, isError: false },
    isSaving: false,
    saveProviderMutation: { mutateAsync: mockSave },
    replaceApiKeysMutation: { mutateAsync: jest.fn() },
  }),
}));
jest.mock('../../../components/ProviderForm', () => ({
  ...jest.requireActual('../../../components/ProviderForm/utils/providerFormValues'),
  ...jest.requireActual('../../../components/ProviderForm/hooks/useProviderFormDraft'),
}));
jest.mock('../../../hooks/useProviderAvatar', () => ({
  useProviderAvatar: () => null,
  useProviderAvatarActions: () => ({ persist: jest.fn(), remove: jest.fn() }),
}));

describe('shared provider configuration saves', () => {
  let renderer: ReactTestRenderer;
  let configuration: ReturnType<typeof useProviderConfigurationForm>;
  function Probe() {
    configuration = useProviderConfigurationForm('custom');
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockModels = [followingModel];
    mockSave.mockResolvedValue(mockProvider);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('waits for confirmation before changing the endpoint followed by existing models', async () => {
    const onSaved = jest.fn();
    act(() => configuration.form.actions.setDefaultChatEndpoint(ENDPOINT_TYPE.ANTHROPIC_MESSAGES));
    act(() => configuration.requestSave(onSaved));

    expect(mockConfirm.mock.calls[0][0].description).toBe(
      'settings.provider.apiService.defaultEndpointChangeMessage:1',
    );
    expect(mockSave).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(configuration.form.meta.isDirty).toBe(true);

    await act(async () => {
      mockConfirm.mock.calls[0][0].onConfirm();
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultChatEndpoint: ENDPOINT_TYPE.ANTHROPIC_MESSAGES }),
    );
    expect(onSaved).toHaveBeenCalledWith({ providerId: 'custom', providerName: 'Custom' });
    expect(configuration.form.meta.isDirty).toBe(false);
  });

  it('blocks removal of an endpoint explicitly used by a model', () => {
    mockModels = [{ ...followingModel, endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES] }];
    act(() => renderer.update(<Probe />));
    act(() => configuration.form.actions.setEndpointUrl(ENDPOINT_TYPE.ANTHROPIC_MESSAGES, ''));
    act(() => configuration.requestSave());
    expect(mockAlert.mock.calls[0][0].description).toBe(
      'settings.provider.apiService.endpointInUseMessage:1',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('normalizes a successful save without prompting when the default is unchanged', async () => {
    act(() => configuration.form.actions.setName(' Renamed '));
    await act(async () => {
      configuration.requestSave();
    });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
    expect(configuration.form.state.name).toBe('Renamed');
    expect(configuration.form.meta.isDirty).toBe(false);
  });

  it('retains the draft and prevents continuation when persistence fails', async () => {
    const onSaved = jest.fn();
    mockSave.mockRejectedValue(new Error('write failed'));
    act(() => configuration.form.actions.setName('Unsaved'));
    await act(async () => {
      configuration.requestSave(onSaved);
    });
    expect(configuration.form.state.name).toBe('Unsaved');
    expect(configuration.form.meta.isDirty).toBe(true);
    expect(configuration.isSaving).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });
});
