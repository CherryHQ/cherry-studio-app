import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useProviderModelAdd } from '../useProviderModelAdd';

type ModelAdd = ReturnType<typeof useProviderModelAdd>;
let mockResolvedModels: Model[] | undefined;
let mockExistingModels: Model[] = [];
let mockLookupPending = false;
const mockAddModels = jest.fn();
const mockRefetchModels = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ isLoading: false, trigger: mockAddModels }),
  useQuery: (path: string, options?: { query?: { ids: string } }) => {
    if (path === '/models') return { data: mockExistingModels, refetch: mockRefetchModels };
    const id = options?.query?.ids ?? '';
    return {
      data: mockLookupPending
        ? undefined
        : (mockResolvedModels ??
          (id
            ? [
                {
                  capabilities: [],
                  id: `custom::${id}`,
                  modelId: id,
                  providerId: 'custom',
                  name: id,
                  isEnabled: true,
                  isHidden: false,
                  isDeprecated: false,
                  supportsStreaming: true,
                },
              ]
            : [])),
      refetch: jest.fn(),
    };
  },
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
    jest.useFakeTimers();
    mockResolvedModels = undefined;
    mockExistingModels = [];
    mockLookupPending = false;
    mockAddModels.mockReset().mockResolvedValue([]);
    mockRefetchModels.mockReset().mockResolvedValue({ data: [] });
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    modelAdd = undefined;
    jest.useRealTimers();
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
    act(() => current().updateEndpointType(ENDPOINT_TYPE.ANTHROPIC_MESSAGES));

    expect(current().isDirty).toBe(true);
  });

  it('comes back clean after a reset', () => {
    act(() => current().updateModelId('gpt-4o'));
    act(() => current().updateContextWindow('128000'));
    expect(current().isDirty).toBe(true);

    act(() => current().resetForm());

    expect(current().isDirty).toBe(false);
  });

  it('keeps the hand-written name when the model id changes', () => {
    act(() => current().updateName('My name'));
    act(() => current().updateModelId('new-id'));
    expect(current().formState.name).toBe('My name');
  });

  it('does not store capability overrides after a tag is toggled back', () => {
    act(() => current().updateCapability('vision', true));
    expect(current().isDirty).toBe(true);
    act(() => current().updateCapability('vision', false));
    expect(current().isDirty).toBe(false);
  });

  it('can undo drawing selected through an explicit image endpoint', () => {
    act(() => current().updateEndpointType(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT));
    expect(current().capabilities.drawing).toBe(true);
    act(() => current().updateCapability('drawing', false));
    expect(current().formState.endpointType).toBe('auto');
    expect(current().capabilities.drawing).toBe(false);
    expect(current().isDirty).toBe(false);
  });

  it('inherits metadata for the requested alias rather than the returned catalog id', async () => {
    mockResolvedModels = [
      {
        capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.FUNCTION_CALL],
        id: createUniqueModelId('custom', 'canonical'),
        modelId: 'canonical',
        presetModelId: 'canonical',
        providerId: 'custom',
        name: 'Catalog display name',
        isEnabled: true,
        isHidden: false,
        isDeprecated: false,
        supportsStreaming: true,
      },
    ];
    act(() => current().updateModelId('provider-alias'));
    expect(current().canSubmit).toBe(false);
    act(() => jest.advanceTimersByTime(250));
    expect(current().defaultName).toBe('Catalog display name');
    expect(current().capabilities.vision).toBe(true);
    expect(current().canSubmit).toBe(true);

    act(() => current().updateModelId('different-id'));
    expect(current().canSubmit).toBe(false);
    expect(current().baseline).toBeUndefined();

    act(() => current().updateModelId('provider-alias'));
    act(() => jest.advanceTimersByTime(250));
    await act(async () => {
      expect(await current().submitAddModel()).toBe(true);
    });
    expect(mockAddModels).toHaveBeenCalledWith({
      body: [{ modelId: 'provider-alias', providerId: 'custom' }],
    });
  });

  it('blocks save while metadata is unresolved', async () => {
    mockLookupPending = true;
    act(() => current().updateModelId('unresolved'));
    act(() => jest.advanceTimersByTime(250));
    expect(current().canSubmit).toBe(false);
    await act(async () => {
      expect(await current().submitAddModel()).toBe(false);
    });
    expect(mockAddModels).not.toHaveBeenCalled();
  });

  it('guards two immediate save calls before a render can disable the button', async () => {
    act(() => current().updateModelId('new-model'));
    act(() => jest.advanceTimersByTime(250));
    expect(current().canSubmit).toBe(true);
    await act(async () => {
      const first = current().submitAddModel();
      const second = current().submitAddModel();
      expect(await second).toBe(false);
      expect(await first).toBe(true);
    });
    expect(mockAddModels).toHaveBeenCalledTimes(1);
    expect(current().isDirty).toBe(false);
  });

  it('retains the draft after a failed save', async () => {
    mockAddModels.mockRejectedValue(new Error('write failed'));
    act(() => current().updateModelId('new-model'));
    act(() => jest.advanceTimersByTime(250));
    await act(async () => {
      expect(await current().submitAddModel()).toBe(false);
    });
    expect(current().formState.modelId).toBe('new-model');
    expect(current().isSubmitting).toBe(false);
  });

  it.each(['model-a,model-b', 'model-a，model-b'])(
    'does not submit multiple IDs: %s',
    async (value) => {
      act(() => current().updateModelId(value));
      act(() => jest.advanceTimersByTime(250));
      expect(current().canSubmit).toBe(false);
      expect(current().isResolving).toBe(false);
      expect(current().fieldErrors.modelId).toBe('settings.provider.models.addSingleModelOnly');
      await act(async () => {
        expect(await current().submitAddModel()).toBe(false);
      });
      expect(mockAddModels).not.toHaveBeenCalled();
      expect(current().formState.modelId).toBe(value);
    },
  );

  it('shows an inline error for an existing model instead of skipping it', () => {
    mockExistingModels = [
      {
        capabilities: [],
        id: createUniqueModelId('custom', 'existing'),
        modelId: 'existing',
        providerId: 'custom',
        name: 'Existing',
        isEnabled: true,
        isHidden: false,
        isDeprecated: false,
        supportsStreaming: true,
      },
    ];
    act(() => current().updateModelId('existing'));
    expect(current().canSubmit).toBe(false);
    expect(current().fieldErrors.modelId).toBe('settings.provider.models.addDuplicate');
  });
});
