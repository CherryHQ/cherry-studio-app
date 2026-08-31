import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Provider } from '@/shared/data/types/provider';

import { useProviderModelAdd } from '../useProviderModelAdd';

type ModelAdd = ReturnType<typeof useProviderModelAdd>;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ isLoading: false, trigger: jest.fn() }),
  useQuery: () => ({ data: [], refetch: jest.fn() }),
}));

const customProvider: Provider = {
  apiFeatures: {
    arrayContent: true,
    reportsActualCost: false,
    serviceTier: true,
    streamOptions: true,
    verbosity: false,
  },
  apiKeys: [],
  authType: 'api-key',
  id: 'custom',
  isEnabled: true,
  name: 'Custom',
  settings: {},
};

/**
 * `isDirty` is what decides whether backing out of the add-model form, or
 * switching it to the sync tab, costs the user a discard prompt. A form that
 * reports itself dirty while untouched prompts on every exit.
 */
describe('useProviderModelAdd dirty tracking', () => {
  let renderer: ReactTestRenderer | undefined;
  let modelAdd: ModelAdd | undefined;

  function Probe() {
    modelAdd = useProviderModelAdd({ provider: customProvider });
    return null;
  }

  function current() {
    if (!modelAdd) {
      throw new Error('useProviderModelAdd probe was not rendered.');
    }

    return modelAdd;
  }

  beforeEach(() => {
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    modelAdd = undefined;
  });

  it('starts clean', () => {
    expect(current().isDirty).toBe(false);
  });

  it('goes dirty on a model id and clean again when it is cleared', () => {
    act(() => current().updateModelId('gpt-4o'));
    expect(current().isDirty).toBe(true);

    act(() => current().updateModelId(''));
    expect(current().isDirty).toBe(false);
  });

  it('goes dirty on an advanced field the user opened just to look at', () => {
    act(() => current().updateContextWindow('128000'));

    expect(current().isDirty).toBe(true);
  });

  it('goes dirty when the chat endpoint moves off the provider default', () => {
    act(() => current().updateChatEndpointType(ENDPOINT_TYPE.ANTHROPIC_MESSAGES));

    expect(current().isDirty).toBe(true);
  });

  it('comes back clean after a reset', () => {
    act(() => current().updateModelId('gpt-4o'));
    act(() => current().updateContextWindow('128000'));
    expect(current().isDirty).toBe(true);

    act(() => current().resetForm());

    expect(current().isDirty).toBe(false);
  });
});
