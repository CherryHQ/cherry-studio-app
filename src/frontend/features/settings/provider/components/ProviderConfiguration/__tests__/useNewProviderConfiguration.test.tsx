import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useNewProviderConfiguration } from '../hooks/useNewProviderConfiguration';

const mockCreateProvider = jest.fn();
const mockPersistAvatar = jest.fn();
const mockToast = jest.fn();
let mockUuid = 0;

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `provider-${++mockUuid}`,
}));
jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ trigger: mockCreateProvider }),
}));
jest.mock('@/frontend/hooks/useProviderAvatar', () => ({
  useProviderAvatarActions: () => ({ persist: mockPersistAvatar, remove: jest.fn() }),
}));

describe('new provider creation', () => {
  let renderer: ReactTestRenderer;
  let configuration: ReturnType<typeof useNewProviderConfiguration>;
  function Probe() {
    configuration = useNewProviderConfiguration();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateProvider.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  async function fillDraft() {
    const { actions } = configuration.value;
    await act(async () => {
      await actions.rename('Gateway');
      await actions.addApiKey({ id: 'key', isEnabled: true, key: 'sk-test' });
      await actions.setEndpointUrl('openai-chat-completions', 'https://example.com/v1');
      await actions.setAvatar('file:///avatar.png');
    });
  }

  it('finishes creating the provider when only its avatar fails to save', async () => {
    mockPersistAvatar.mockRejectedValue(new Error('copy failed'));
    await fillDraft();

    let created: Awaited<ReturnType<typeof configuration.create>>;
    await act(async () => {
      created = await configuration.create();
    });

    expect(created).toEqual({ providerId: 'provider-1', providerName: 'Gateway' });
    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      label: 'settings.provider.add.avatarSaveFailed',
      variant: 'warning',
    });
    expect(configuration.isCreating).toBe(false);
  });

  it('creates a provider with its draft key order and original labels and enabled states', async () => {
    await fillDraft();
    await act(async () => {
      await configuration.value.actions.addApiKey({
        id: 'backup',
        isEnabled: false,
        key: 'sk-backup',
        label: 'Personal',
      });
    });
    const keys = configuration.value.apiKeys!;
    await act(async () => {
      await configuration.value.actions.reorderApiKeys([keys[1], keys[0]]);
    });
    expect(configuration.isDirty).toBe(true);
    await act(async () => {
      await configuration.create();
    });
    expect(mockCreateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ apiKeys: [keys[1], keys[0]] }),
      }),
    );
  });
});
