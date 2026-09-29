import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, MODEL_CAPABILITY, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useSavedModelSettings } from '../useSavedModelSettings';

const mockTrigger = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();
const mockAlert = jest.fn();
const mockCache = new Map<string, unknown>();

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlert } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: (key: string[]) => mockCache.get(key[0]),
    setQueryData: (key: string[], data: unknown) => mockCache.set(key[0], data),
  }),
}));
jest.mock('@/frontend/data', () => ({
  queryKeys: { models: { detail: (id: string) => [`/models/${id}`] } },
  useMutation: () => ({ trigger: mockTrigger }),
}));
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
    mockCache.clear();
    mockTrigger.mockImplementation(async ({ body }: { body: Partial<Model> }) => ({
      ...((mockCache.get(`/models/${model.id}`) as Model | undefined) ?? model),
      ...body,
    }));
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

  it('keeps the page usable and shows a switch at once while it saves', async () => {
    let finish: (saved: Model) => void = () => undefined;
    mockTrigger.mockReturnValue(new Promise<Model>((resolve) => (finish = resolve)));
    act(() => settings.actions.setCapability('reasoning', true));
    expect(settings.disabled).toBe(false);
    expect(settings.capabilities.reasoning).toBe(true);
    await act(async () => finish({ ...model, capabilities: ['reasoning'] } as Model));
    expect(mockCache.get(`/models/${model.id}`)).toMatchObject({ capabilities: ['reasoning'] });
  });

  it('builds each queued change from the model the previous write returned', async () => {
    await act(async () => {
      settings.actions.setCapability('reasoning', true);
      settings.actions.setCapability('functionCall', true);
    });
    expect(mockTrigger).toHaveBeenCalledTimes(2);
    expect(mockTrigger.mock.calls[1][0].body.capabilities).toEqual(
      expect.arrayContaining([MODEL_CAPABILITY.REASONING, MODEL_CAPABILITY.FUNCTION_CALL]),
    );
  });

  it('puts a switch back when its write fails', async () => {
    mockTrigger.mockRejectedValue(new Error('write failed'));
    await act(async () => {
      settings.actions.setCapability('reasoning', true);
    });
    expect(settings.capabilities.reasoning).toBe(false);
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
