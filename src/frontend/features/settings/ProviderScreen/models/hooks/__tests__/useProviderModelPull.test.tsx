import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ModelPullTimeoutError } from '@/shared/contracts';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { useProviderModelPull, type ProviderModelPullLoadResult } from '../useProviderModelPull';

type ModelPull = ReturnType<typeof useProviderModelPull>;

const mockPull = jest.fn();
const mockReconcile = jest.fn();
const mockAlertShow = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), refetchQueries: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    agents: { all: () => ['agents'] },
    models: { list: (query?: unknown) => ['models', query] },
    providers: {
      detail: (providerId: string) => ['providers', providerId],
      list: () => ['providers'],
      page: () => ['providers', 'page'],
    },
  },
  useBackendModule: () => ({ pull: mockPull, reconcile: mockReconcile }),
}));

const newModel: Model = {
  capabilities: [],
  id: createUniqueModelId('provider-1', 'gpt-4o'),
  isDeprecated: false,
  isEnabled: true,
  isHidden: false,
  modelId: 'gpt-4o',
  name: 'GPT-4o',
  providerId: 'provider-1',
  supportsStreaming: true,
};

describe('useProviderModelPull', () => {
  let renderer: ReactTestRenderer | undefined;
  let modelPull: ModelPull | undefined;

  function Probe({ providerId = 'provider-1' }: { providerId?: string }) {
    modelPull = useProviderModelPull({ providerId });
    return null;
  }

  function mount(providerId?: string) {
    act(() => {
      renderer = create(<Probe providerId={providerId} />);
    });

    return current();
  }

  function current() {
    if (!modelPull) {
      throw new Error('useProviderModelPull probe was not rendered.');
    }

    return modelPull;
  }

  async function load(): Promise<ProviderModelPullLoadResult> {
    let result: ProviderModelPullLoadResult | undefined;

    await act(async () => {
      result = await current().loadPullPreview();
    });

    if (!result) {
      throw new Error('loadPullPreview did not settle.');
    }

    return result;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    modelPull = undefined;
  });

  it('hands back the preview when the provider has changes', async () => {
    mockPull.mockResolvedValue({ preview: { added: [newModel], missing: [] }, status: 'changes' });
    mount();

    expect(await load()).toBe('ready');
    expect(current().preview).toEqual({ added: [newModel], missing: [] });
  });

  it('reports an up-to-date provider without a preview', async () => {
    mockPull.mockResolvedValue({ providerEnabled: true, status: 'up-to-date' });
    mount();

    expect(await load()).toBe('empty');
    expect(current().preview).toBeNull();
  });

  it('tells a timeout apart from any other failure', async () => {
    mockPull.mockRejectedValue(new ModelPullTimeoutError(30_000));
    mount();

    expect(await load()).toBe('timedOut');

    mockPull.mockRejectedValue(new Error('offline'));

    expect(await load()).toBe('failed');
  });

  it('fails without reaching the provider when there is no id', async () => {
    mount('');

    expect(await load()).toBe('failed');
    expect(mockPull).not.toHaveBeenCalled();
  });

  // The screen a pull runs on renders the outcome itself, so a dialog or a
  // toast from here would put the same sentence on screen twice.
  it('says nothing on its own for any outcome', async () => {
    mockPull.mockResolvedValue({ providerEnabled: true, status: 'up-to-date' });
    mount();
    await load();

    mockPull.mockRejectedValue(new Error('offline'));
    await load();

    mockPull.mockRejectedValue(new ModelPullTimeoutError(30_000));
    await load();

    expect(mockAlertShow).not.toHaveBeenCalled();
  });
});
