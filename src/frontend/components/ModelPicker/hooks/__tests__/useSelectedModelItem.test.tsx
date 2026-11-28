import { useState } from 'react';
import { act, create } from 'react-test-renderer';

import { CLOUD_PROVIDER_ID, CloudModelSchema, type CloudState } from '@/shared/contracts/cloud';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useSelectedModelItem } from '../useSelectedModelItem';

const mockEmptyList = Object.freeze([]);
const signedOut: CloudState = {
  phase: 'signed_out',
  account: null,
  plans: null,
  models: mockEmptyList,
  isRefreshing: false,
};
let mockCloudState = signedOut;
let mockModels: readonly Model[] = mockEmptyList;
let mockProviders: readonly Provider[] = mockEmptyList;
let mockEnterprise = false;
let mockModelsData: readonly Model[] | undefined = mockEmptyList;
let mockProvidersData: readonly Provider[] | undefined = mockEmptyList;
let mockModelCalls: { query: unknown; options: unknown }[] = [];
let mockProviderCalls: { query: unknown; options: unknown }[] = [];

const openaiProvider = { id: 'openai', name: 'OpenAI', isEnabled: true } as Provider;
const cloudProvider = { id: CLOUD_PROVIDER_ID, name: 'CherryAI', isEnabled: true } as Provider;

jest.mock('@/shared/data/activeProfile', () => ({
  ...jest.requireActual('@/shared/data/activeProfile'),
  isEnterpriseProfile: () => mockEnterprise,
}));
jest.mock('@/frontend/hooks/useCloud', () => ({ useCloud: () => ({ state: mockCloudState }) }));
jest.mock('@/frontend/hooks/chat', () => ({
  useModels: (query: unknown, options: unknown) => {
    mockModelCalls.push({ query, options });
    return {
      isLoading: false,
      models: mockModels,
      modelsQuery: { data: mockModelsData },
    };
  },
  useProviders: (query: unknown, options: unknown) => {
    mockProviderCalls.push({ query, options });
    return {
      isLoading: false,
      providers: mockProviders,
      providersQuery: { data: mockProvidersData },
    };
  },
}));

describe('useSelectedModelItem', () => {
  beforeEach(() => {
    mockCloudState = signedOut;
    mockEnterprise = false;
    mockModels = mockEmptyList;
    mockProviders = mockEmptyList;
    mockModelsData = mockEmptyList;
    mockProvidersData = mockEmptyList;
    mockModelCalls = [];
    mockProviderCalls = [];
  });

  test('queries only the target model id and returns a stable item', () => {
    const model = {
      id: 'openai::gpt-4o',
      modelId: 'gpt-4o',
      providerId: 'openai',
      name: 'GPT-4o',
      isEnabled: true,
      isHidden: false,
      capabilities: [],
    } as unknown as Model;
    mockModels = [model];
    mockProviders = [openaiProvider];

    const [first, second] = renderHookTwice(() =>
      useSelectedModelItem({ modelId: 'openai::gpt-4o', modelType: 'all' }),
    );

    expect(mockModelCalls[0]).toEqual({
      query: { enabled: true, id: 'openai::gpt-4o', isSystemSupported: true },
      options: { enabled: true },
    });
    expect(mockProviderCalls[0]).toEqual({
      query: { enabled: true },
      options: { enabled: true },
    });
    expect(first?.hasResolved).toBe(true);
    expect(first?.item?.modelId).toBe('openai::gpt-4o');
    expect(second).toBe(first);
  });

  test('disables underlying queries when disabled or when modelId is missing', () => {
    const [whenDisabled] = renderHookTwice(() =>
      useSelectedModelItem({ modelId: 'openai::gpt-4o', enabled: false }),
    );
    expect(whenDisabled?.hasResolved).toBe(false);
    expect(whenDisabled?.item).toBeUndefined();
    expect(mockModelCalls[0]?.options).toEqual({ enabled: false });
    expect(mockProviderCalls[0]?.options).toEqual({ enabled: false });

    mockModelCalls = [];
    mockProviderCalls = [];
    const [whenNull] = renderHookTwice(() => useSelectedModelItem({ modelId: null }));
    expect(whenNull?.hasResolved).toBe(false);
    expect(mockModelCalls[0]?.options).toEqual({ enabled: false });
  });

  test('resolves an invalid non-empty modelId immediately without querying', () => {
    const [result] = renderHookTwice(() => useSelectedModelItem({ modelId: 'not-a-unique-id' }));
    expect(result?.hasResolved).toBe(true);
    expect(result?.item).toBeUndefined();
    expect(mockModelCalls[0]?.options).toEqual({ enabled: false });
  });

  test('waits for cloud catalog projection only when a cloud model is selected', () => {
    mockProviders = [cloudProvider, openaiProvider];
    mockCloudState = {
      ...signedOut,
      guestCatalog: 'ready',
      models: [
        CloudModelSchema.parse({
          id: 'guest-model',
          available_features: ['agent'],
          requires_login: false,
          requires_plan: false,
        }),
      ],
    };

    const [localResult] = renderHookTwice(() =>
      useSelectedModelItem({ modelId: 'openai::gpt-4o' }),
    );
    expect(localResult?.hasResolved).toBe(true);

    const [cloudResult] = renderHookTwice(() =>
      useSelectedModelItem({ modelId: `${CLOUD_PROVIDER_ID}::guest-model` }),
    );
    expect(cloudResult?.hasResolved).toBe(false);

    const [delistedCloudResult] = renderHookTwice(() =>
      useSelectedModelItem({ modelId: `${CLOUD_PROVIDER_ID}::delisted-model` }),
    );
    expect(delistedCloudResult?.hasResolved).toBe(true);
    expect(delistedCloudResult?.item).toBeUndefined();
  });
});

type HookResult = ReturnType<typeof useSelectedModelItem>;

function renderHookTwice(hook: () => HookResult): (HookResult | undefined)[] {
  const results: (HookResult | undefined)[] = [];
  let forceRender: (() => void) | undefined;

  function Probe() {
    const [, setTick] = useState(0);
    forceRender = () => setTick((tick) => tick + 1);
    results.push(hook());
    return null;
  }

  act(() => {
    create(<Probe />);
  });
  act(() => {
    forceRender?.();
  });

  return results;
}
