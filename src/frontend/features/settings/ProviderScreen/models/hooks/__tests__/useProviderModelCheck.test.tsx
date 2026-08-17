import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useProviderModelCheck } from '../useProviderModelCheck';

type ModelCheck = ReturnType<typeof useProviderModelCheck>;

const mockCheckHealth = jest.fn();
const mockAlertShow = jest.fn();
const mockToastShow = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    providers: {
      detail: (providerId: string) => ['providers', providerId],
      list: () => ['providers'],
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

describe('useProviderModelCheck', () => {
  let renderer: ReactTestRenderer | undefined;
  let modelCheck: ModelCheck | undefined;

  function Probe() {
    modelCheck = useProviderModelCheck({ apiKeys: [], models: [model], providerId: 'provider-1' });
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
});
