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
const mockModelQueries: unknown[] = [];
const mockTogglePin = jest.fn();

jest.mock('@/frontend/hooks/chat', () => ({
  useModels: (query: unknown) => {
    mockModelQueries.push(query);
    return { isLoading: false, models: mockEmptyList };
  },
  useProviders: () => ({ isLoading: false, providers: mockEmptyList }),
  usePins: () => ({
    isLoading: false,
    isMutating: false,
    isRefreshing: false,
    pins: mockEmptyList,
    togglePin: mockTogglePin,
  }),
}));

describe('useModelPickerData', () => {
  beforeEach(() => {
    mockModelQueries.length = 0;
  });

  test('returns the same reference across re-renders', () => {
    const results = renderHookTwice(() => useModelPickerData());

    expect(results[1]).toBe(results[0]);
  });

  test('stays stable when the caller omits selectedTags', () => {
    // A `= []` default would allocate a new array per call and invalidate the
    // `groups` memo — the most expensive computation in the hook.
    const results = renderHookTwice(() => useModelPickerData({ searchText: '' }));

    expect(results[1]?.groups).toBe(results[0]?.groups);
  });

  test('exposes only reference-stable fields', () => {
    const [result] = renderHookTwice(() => useModelPickerData());

    // `pins` (a fresh object literal from usePins) and `queries` (react-query
    // hands back a newly tracked proxy each render) can never be stable, so the
    // hook must not surface them.
    expect(result).not.toHaveProperty('pins');
    expect(result).not.toHaveProperty('queries');
  });

  test('limits the model query to one provider when requested', () => {
    renderHookTwice(() => useModelPickerData({ providerId: 'provider-1' }));

    expect(mockModelQueries).toContainEqual({ enabled: true, providerId: 'provider-1' });
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
