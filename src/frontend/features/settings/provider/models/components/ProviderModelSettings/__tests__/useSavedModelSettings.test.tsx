import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useSavedModelSettings } from '../useSavedModelSettings';

const mockTrigger = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();
const mockAlert = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlert } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('@/frontend/data', () => ({ useMutation: () => ({ trigger: mockTrigger }) }));
jest.mock('../../../utils/refreshProviderModelQueries', () => ({
  refreshProviderModelQueries: (...args: unknown[]) => mockRefresh(...args),
}));

const provider = { authType: 'api-key', id: 'custom', name: 'Custom' } as unknown as Provider;
const model: Model = {
  capabilities: [],
  contextWindow: 128000,
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

describe('saved model settings write each change', () => {
  let renderer: ReactTestRenderer;
  let settings: ReturnType<typeof useSavedModelSettings>;
  function Probe() {
    settings = useSavedModelSettings(model, provider);
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrigger.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('writes a rename on its own', async () => {
    let error: string | undefined = 'unset';
    await act(async () => {
      error = await settings.actions.rename(' Renamed ');
    });
    expect(error).toBeUndefined();
    expect(mockTrigger).toHaveBeenCalledWith({
      body: { name: 'Renamed' },
      params: { uniqueModelId: model.id },
    });
    expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), 'custom');
  });

  it('rejects an output limit that does not fit the context window without writing', async () => {
    let error: string | undefined;
    await act(async () => {
      error = await settings.actions.setLimit('maxOutputTokens', '200000');
    });
    expect(error).toBe('settings.provider.models.form.invalidLimits');
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('clears a limit back to the default with null', async () => {
    await act(async () => {
      await settings.actions.setLimit('contextWindow', '');
    });
    expect(mockTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ body: { contextWindow: null } }),
    );
  });

  it('writes nothing when a value is saved unchanged', async () => {
    await act(async () => {
      await settings.actions.setGroup('');
    });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('writes a capability switch as a capability change', async () => {
    await act(async () => {
      settings.actions.setCapability('reasoning', true);
    });
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger.mock.calls[0][0].body.capabilities).toContain('reasoning');
  });

  it('reports a failed write and resolves to its message', async () => {
    mockTrigger.mockRejectedValue(new Error('write failed'));
    let error: string | undefined;
    await act(async () => {
      error = await settings.actions.rename('Renamed');
    });
    expect(error).toBe('settings.provider.models.detail.saveFailed');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });
});
