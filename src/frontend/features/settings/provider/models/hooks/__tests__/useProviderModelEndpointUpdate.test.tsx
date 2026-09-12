import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Model } from '@/shared/data/types/model';

import { PROVIDER_DEFAULT_ENDPOINT_SELECTION } from '../../utils/providerModelEndpoint';
import { useProviderModelEndpointUpdate } from '../useProviderModelEndpointUpdate';

type ModelEndpointUpdate = ReturnType<typeof useProviderModelEndpointUpdate>;

const mockQueryClient = {};
const mockUpdateModel = jest.fn();
const mockRefreshProviderModelQueries = jest.fn();
const mockToastShow = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ trigger: mockUpdateModel }),
}));

jest.mock('../../utils/refreshProviderModelQueries', () => ({
  refreshProviderModelQueries: (queryClient: unknown, providerId: string) =>
    mockRefreshProviderModelQueries(queryClient, providerId),
}));

const model = {
  capabilities: [],
  id: 'provider-1::model-1',
  isDeprecated: false,
  isEnabled: true,
  isHidden: false,
  modelId: 'model-1',
  name: 'Model One',
  providerId: 'provider-1',
  supportsStreaming: true,
} as Model;

describe('useProviderModelEndpointUpdate', () => {
  let endpointUpdate: ModelEndpointUpdate | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe() {
    endpointUpdate = useProviderModelEndpointUpdate('provider-1');
    return null;
  }

  function current() {
    if (!endpointUpdate) {
      throw new Error('useProviderModelEndpointUpdate probe was not rendered.');
    }

    return endpointUpdate;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateModel.mockResolvedValue(undefined);
    mockRefreshProviderModelQueries.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    endpointUpdate = undefined;
  });

  it('patches an explicit endpoint and refreshes every model consumer', async () => {
    let didUpdate: boolean | undefined;

    await act(async () => {
      didUpdate = await current().updateEndpoint(model, ENDPOINT_TYPE.ANTHROPIC_MESSAGES);
    });

    expect(didUpdate).toBe(true);
    expect(mockUpdateModel).toHaveBeenCalledWith({
      body: { endpointTypes: [ENDPOINT_TYPE.ANTHROPIC_MESSAGES] },
      params: { uniqueModelId: model.id },
    });
    expect(mockRefreshProviderModelQueries).toHaveBeenCalledWith(mockQueryClient, 'provider-1');
  });

  it('stores an empty endpoint list when the model follows the provider default', async () => {
    await act(async () => {
      await current().updateEndpoint(model, PROVIDER_DEFAULT_ENDPOINT_SELECTION);
    });

    expect(mockUpdateModel).toHaveBeenCalledWith({
      body: { endpointTypes: [] },
      params: { uniqueModelId: model.id },
    });
  });

  it('keeps the previous selection and reports a failed patch', async () => {
    mockUpdateModel.mockRejectedValue(new Error('offline'));

    let didUpdate: boolean | undefined;
    await act(async () => {
      didUpdate = await current().updateEndpoint(model, ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    });

    expect(didUpdate).toBe(false);
    expect(mockRefreshProviderModelQueries).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.provider.models.endpoint.updateFailed',
      variant: 'danger',
    });
  });
});
