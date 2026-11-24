import { useState } from 'react';
import { act, create } from 'react-test-renderer';

import { CLOUD_PROVIDER_ID, CloudModelSchema, type CloudState } from '@/shared/contracts/cloud';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useModelPickerData } from '../useModelPickerData';

// The hook's value is a stable reference: consumers key their own memos on it
// (e.g. ModelSettingsScreen's `items`). These tests pin that contract, since a
// fresh object literal per render silently defeats every downstream memo.
//
// `mock`-prefixed names are the only out-of-scope variables jest.mock factories
// may reference (they're hoisted above the imports).
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
const cloudProvider = { id: CLOUD_PROVIDER_ID, name: 'CherryAI', isEnabled: true } as Provider;
jest.mock('@/shared/data/activeProfile', () => ({
  ...jest.requireActual('@/shared/data/activeProfile'),
  isEnterpriseProfile: () => mockEnterprise,
}));
jest.mock('@/frontend/hooks/useCloud', () => ({ useCloud: () => ({ state: mockCloudState }) }));
const mockModelQueries: unknown[] = [];
const mockLoadedQuery = { data: mockEmptyList };
const mockRefetch = jest.fn();
let mockProviderQueryError: Error | null = null;

jest.mock('@/frontend/hooks/chat', () => ({
  useModels: (query: unknown) => {
    mockModelQueries.push(query);
    return {
      isLoading: false,
      models: mockModels,
      modelsQuery: mockLoadedQuery,
      refetch: mockRefetch,
    };
  },
  useProviders: () => ({
    isLoading: false,
    providers: mockProviders,
    providersQuery: { data: mockEmptyList, error: mockProviderQueryError ?? undefined },
    refetch: mockRefetch,
  }),
}));

describe('useModelPickerData', () => {
  beforeEach(() => {
    mockCloudState = signedOut;
    mockEnterprise = false;
    mockModels = mockEmptyList;
    mockProviders = mockEmptyList;
    mockModelQueries.length = 0;
    mockProviderQueryError = null;
  });

  test('returns the same reference across re-renders', () => {
    const results = renderHookTwice(() => useModelPickerData({ modelType: 'text' }));

    expect(results[1]).toBe(results[0]);
  });

  test('keeps the grouped result stable across an unchanged search', () => {
    const results = renderHookTwice(() =>
      useModelPickerData({ modelType: 'text', searchText: '' }),
    );

    expect(results[1]?.groups).toBe(results[0]?.groups);
  });

  test('exposes only reference-stable fields', () => {
    const [result] = renderHookTwice(() => useModelPickerData({ modelType: 'text' }));

    // `queries` (react-query hands back a newly tracked proxy each render) can
    // never be stable, so the hook must not surface it.
    expect(result).not.toHaveProperty('queries');
  });

  test('limits the model query to one provider when requested', () => {
    renderHookTwice(() => useModelPickerData({ modelType: 'text', providerId: 'provider-1' }));

    expect(mockModelQueries).toContainEqual({
      enabled: true,
      isSystemSupported: true,
      providerId: 'provider-1',
    });
  });

  test.each([
    { phase: 'signed_out' },
    { phase: 'signed_out', guestCatalog: 'loading' },
    { phase: 'loading' },
  ] as const)('keeps the enabled cloud catalog pending for %o', (state) => {
    mockProviders = [cloudProvider];
    mockCloudState = { ...signedOut, ...state };

    const [result, rerendered] = renderHookTwice(() => useModelPickerData({ modelType: 'text' }));
    expect(result?.hasLoadedCatalog).toBe(false);
    expect(rerendered).toBe(result);
  });

  test('waits for the model query to catch up after the guest catalog is published', () => {
    mockProviders = [cloudProvider];
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

    const [beforeRefetch, afterRefetch] = renderHookTwice(
      () => useModelPickerData({ modelType: 'all' }),
      () => {
        mockModels = [
          {
            id: 'cloud-model',
            modelId: 'guest-model',
            providerId: CLOUD_PROVIDER_ID,
            name: 'Guest model',
            isEnabled: true,
            capabilities: [],
          } as unknown as Model,
        ];
      },
    );

    expect(beforeRefetch?.modelItems).toHaveLength(0);
    expect(beforeRefetch?.hasLoadedCatalog).toBe(false);
    expect(afterRefetch?.hasLoadedCatalog).toBe(true);
    expect(afterRefetch?.modelItems).toHaveLength(1);
  });

  test.each([
    { phase: 'signed_out', guestCatalog: 'error' },
    { phase: 'error' },
    { phase: 'signed_out', guestCatalog: 'ready' },
  ] as const)('settles an empty enabled cloud catalog for %o', (state) => {
    mockProviders = [cloudProvider];
    mockCloudState = { ...signedOut, ...state };
    const [result] = renderHookTwice(() => useModelPickerData({ modelType: 'text' }));

    expect(result?.hasLoadedCatalog).toBe(true);
    expect(result?.modelItems).toHaveLength(0);
  });

  test.each(['disabled', 'other-provider', 'enterprise'])(
    'does not wait for cloud when %s',
    (scope) => {
      if (scope !== 'disabled') mockProviders = [cloudProvider];
      mockEnterprise = scope === 'enterprise';
      const [result] = renderHookTwice(() =>
        useModelPickerData({
          modelType: 'text',
          providerId: scope === 'other-provider' ? 'provider-1' : undefined,
        }),
      );
      expect(result?.hasLoadedCatalog).toBe(true);
    },
  );

  test('does not confirm an empty catalog when a model source failed to load', () => {
    mockProviderQueryError = new Error('Could not load the providers');
    const [result] = renderHookTwice(() => useModelPickerData({ modelType: 'text' }));

    expect(result?.modelItems).toHaveLength(0);
    expect(result?.hasLoadedCatalog).toBe(false);
    expect(result?.error).toBe(mockProviderQueryError);
  });
});

type HookResult = ReturnType<typeof useModelPickerData>;

// Renders `hook` twice under the same component instance and returns both values.
function renderHookTwice(
  hook: () => HookResult,
  beforeRerender?: () => void,
): (HookResult | undefined)[] {
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
  beforeRerender?.();
  act(() => {
    forceRender?.();
  });

  return results;
}
