import { useState } from 'react';
import { act, create } from 'react-test-renderer';

import { useModelPickerData } from '../useModelPickerData';

// The hook's value is a stable reference: consumers key their own memos on it
// (e.g. ModelSettingsScreen's `items`). These tests pin that contract, since a
// fresh object literal per render silently defeats every downstream memo.
//
// `mock`-prefixed names are the only out-of-scope variables jest.mock factories
// may reference (they're hoisted above the imports).
const mockEmptyList = Object.freeze([]);
const mockCloudState = { phase: 'signed_out', account: null, models: mockEmptyList };
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
      models: mockEmptyList,
      modelsQuery: mockLoadedQuery,
      refetch: mockRefetch,
    };
  },
  useProviders: () => ({
    isLoading: false,
    providers: mockEmptyList,
    providersQuery: { data: mockEmptyList, error: mockProviderQueryError ?? undefined },
    refetch: mockRefetch,
  }),
}));

describe('useModelPickerData', () => {
  beforeEach(() => {
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
