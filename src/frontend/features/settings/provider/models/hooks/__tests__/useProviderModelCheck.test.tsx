import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { useProviderModelCheck } from '../useProviderModelCheck';

type ModelCheck = ReturnType<typeof useProviderModelCheck>;

const mockCheckHealth = jest.fn();
const mockAlertShow = jest.fn();
const mockToastShow = jest.fn();
const EMPTY_API_KEYS: readonly ApiKeyEntry[] = [];

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    providers: {
      detail: (providerId: string) => ['providers', providerId],
      list: () => ['providers'],
      page: () => ['providers', 'page'],
    },
  },
  useBackendModule: () => ({ checkHealth: mockCheckHealth }),
}));

const model: Model = {
  capabilities: [],
  id: createUniqueModelId('provider-1', 'model-1'),
  isDeprecated: false,
  isEnabled: true,
  isHidden: false,
  modelId: 'model-1',
  name: 'Model One',
  providerId: 'provider-1',
  supportsStreaming: true,
};
const otherModel: Model = {
  ...model,
  id: createUniqueModelId('provider-1', 'model-2'),
  modelId: 'model-2',
  name: 'Model Two',
};

describe('useProviderModelCheck', () => {
  let renderer: ReactTestRenderer | undefined;
  let modelCheck: ModelCheck | undefined;

  function Probe({
    apiKeys = EMPTY_API_KEYS,
    selectedModelId,
  }: {
    apiKeys?: readonly ApiKeyEntry[];
    selectedModelId?: string;
  }) {
    modelCheck = useProviderModelCheck({
      apiKeys,
      models: [model, otherModel],
      providerId: 'provider-1',
      selectedModelId,
    });
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    modelCheck = undefined;
  });

  test('shows a failed check and its error in an alert instead of a toast', async () => {
    mockCheckHealth.mockResolvedValue([{ error: 'Unauthorized', model, status: 'failed' }]);

    await act(async () => modelCheck?.startCheck());

    expect(mockAlertShow).toHaveBeenCalledWith({
      description: 'Unauthorized',
      title: 'settings.provider.models.checkFailed',
    });
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('checks with the first enabled API key', async () => {
    mockCheckHealth.mockResolvedValue([{ latency: 120, model, status: 'success' }]);
    const apiKeys = [
      { id: 'disabled', isEnabled: false, key: 'sk-disabled' },
      { id: 'enabled', isEnabled: true, key: 'sk-enabled' },
    ];

    act(() => {
      renderer?.update(<Probe apiKeys={apiKeys} />);
    });
    await act(async () => modelCheck?.startCheck());

    expect(mockCheckHealth).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-enabled' }));
  });

  test('stops reporting a result once another model is selected', async () => {
    mockCheckHealth.mockResolvedValue([{ latency: 120, model, status: 'success' }]);

    await act(async () => modelCheck?.startCheck());
    expect(modelCheck?.modelStatus).toMatchObject({ status: 'success' });

    // The picker updates the controlled selection, which makes the result for
    // the previous model stale.
    act(() => {
      renderer?.update(<Probe selectedModelId={otherModel.id} />);
    });

    expect(modelCheck?.selectedModel?.id).toBe(otherModel.id);
    expect(modelCheck?.modelStatus).toMatchObject({ status: 'pending' });
  });
});
