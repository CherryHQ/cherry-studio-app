import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { queryKeys } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';

import { useProviderModelOrder } from '../useProviderModelOrder';

const mockTrigger = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();
const mockGet = jest.fn();
let mockQueryClient: QueryClient;
let mockModels: Model[];
jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ trigger: mockTrigger }),
  useApiClient: () => ({ get: mockGet }),
  queryKeys: { models: { list: (query?: object) => ['/models', query] } },
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: object) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));
jest.mock('../../utils/refreshProviderModelQueries', () => ({
  ...jest.requireActual('../../utils/refreshProviderModelQueries'),
  refreshProviderModelQueries: (...args: unknown[]) => mockRefresh(...args),
}));

function model(id: string, painting = false): Model {
  return {
    id: `p::${id}`,
    modelId: id,
    providerId: 'p',
    name: id,
    capabilities: painting ? [MODEL_CAPABILITY.IMAGE_GENERATION] : [],
    isEnabled: true,
    isHidden: false,
    isDeprecated: false,
    supportsStreaming: true,
  };
}
const baseline = [model('A'), model('P1', true), model('B'), model('P2', true), model('C')];
type Order = ReturnType<typeof useProviderModelOrder>;
let order: Order;
let renderer: ReactTestRenderer;
function capture(result: Order) {
  order = result;
  return null;
}
function Probe({
  models = baseline,
  render = capture,
}: {
  models?: Model[];
  render?: (result: Order) => null;
}) {
  useLayoutEffect(() => {
    mockModels = models;
  }, [models]);
  return render(useProviderModelOrder({ models, providerId: 'p' }));
}
function mount() {
  act(() => {
    renderer = create(<Probe />);
  });
}
async function commit() {
  let result = false;
  await act(async () => {
    result = await order.commit();
  });
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockTrigger.mockResolvedValue(undefined);
  mockRefresh.mockReset().mockResolvedValue(undefined);
  mockGet.mockReset().mockImplementation(async () => mockModels);
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  mount();
});
afterEach(() => {
  act(() => renderer.unmount());
  mockQueryClient.clear();
});

it('edits only a draft, clamps group boundaries, and cancels without a request', () => {
  act(() => order.start());
  expect(order.canMoveUp('p::A')).toBe(false);
  expect(order.canMoveDown('p::C')).toBe(false);
  act(() => order.moveModel('p::A', { before: 'p::P1' }));
  expect(order.draftIds).toEqual(baseline.map(({ id }) => id));
  act(() => order.moveUp('p::C'));
  expect(order.draftIds).toEqual(['p::A', 'p::P1', 'p::C', 'p::P2', 'p::B']);
  act(() => order.moveModel('p::C', { before: 'p::A' }));
  expect(order.draftIds).toEqual(['p::C', 'p::P1', 'p::A', 'p::P2', 'p::B']);
  act(() => order.cancel());
  expect(order.isReordering).toBe(false);
  expect(order.draftIds).toEqual(baseline.map(({ id }) => id));
  expect(mockTrigger).not.toHaveBeenCalled();
});
it('never sends an empty batch, including an undone edit', async () => {
  act(() => order.start());
  expect(await commit()).toBe(true);
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  act(() => order.moveUp('p::A'));
  expect(await commit()).toBe(true);
  expect(mockTrigger).not.toHaveBeenCalled();
});
it('sends the final plan once and waits for query refresh before leaving', async () => {
  let finishRefresh!: () => void;
  mockRefresh.mockReturnValue(
    new Promise<void>((resolve) => {
      finishRefresh = resolve;
    }),
  );
  act(() => order.start());
  act(() => order.moveModel('p::C', { before: 'p::A' }));
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = order.commit();
  });
  expect(order.isSaving).toBe(true);
  expect(order.isReordering).toBe(true);
  expect(mockTrigger).toHaveBeenCalledWith({
    body: { moves: [{ id: 'p::C', anchor: { before: 'p::A' } }] },
  });
  expect(await commit()).toBe(false);
  act(() => order.cancel());
  expect(order.isReordering).toBe(true);
  await act(async () => {
    finishRefresh();
    await saving;
  });
  expect(mockTrigger).toHaveBeenCalledTimes(1);
  expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), 'p', {
    refreshAgents: false,
    throwOnError: true,
    waitForSettled: true,
  });
  expect(order.isReordering).toBe(false);
});
it('keeps a failed draft available for retry and cancel', async () => {
  mockTrigger.mockRejectedValueOnce(new Error('offline'));
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  const draft = order.draftIds;
  expect(await commit()).toBe(false);
  expect(order.draftIds).toEqual(draft);
  expect(order.isReordering).toBe(true);
  expect(order.isSaving).toBe(false);
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.failed',
    variant: 'danger',
  });
  expect(await commit()).toBe(true);
});
it('rebases surviving ids in draft order and appends new server ids', async () => {
  act(() => order.start());
  act(() => order.moveModel('p::C', { before: 'p::A' }));
  act(() => renderer.update(<Probe models={[model('A'), model('B'), model('D')]} />));
  expect(order.draftIds).toEqual(['p::A', 'p::B', 'p::D']);
  expect(await commit()).toBe(true);
  expect(mockTrigger).not.toHaveBeenCalled();
});
it('rebases server order changes without losing surviving draft order', () => {
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  act(() => renderer.update(<Probe models={[model('C'), model('B'), model('A'), model('D')]} />));
  expect(order.draftIds).toEqual(['p::B', 'p::A', 'p::C', 'p::D']);
});
it('distinguishes a committed write with failed refresh and prevents a resend', async () => {
  mockRefresh.mockRejectedValueOnce(new Error('refetch failed'));
  act(() => order.start());
  act(() => order.moveUp('p::C'));
  expect(await commit()).toBe(true);
  expect(order.isReordering).toBe(false);
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.refreshFailed',
    variant: 'danger',
  });
  expect(await commit()).toBe(true);
  expect(mockTrigger).toHaveBeenCalledTimes(1);
});

it('preserves omitted purposes without making them move targets', async () => {
  const hidden = { ...model('embedding'), capabilities: [MODEL_CAPABILITY.EMBEDDING] };
  const models = [model('A'), hidden, model('B')];
  act(() => renderer.update(<Probe models={models} />));
  act(() => order.start());
  act(() => order.moveDown(hidden.id));
  expect(order.draftIds).toEqual(models.map(({ id }) => id));
  act(() => order.moveUp('p::B'));
  expect(order.draftIds).toEqual(['p::B', hidden.id, 'p::A']);
  await commit();
  const moves = mockTrigger.mock.calls[0]![0].body.moves;
  expect(moves.every((move: { id: string }) => move.id !== hidden.id)).toBe(true);
});
it('does not reset edits when only model metadata changes', () => {
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  const draft = order.draftIds;
  act(() =>
    renderer.update(
      <Probe models={baseline.map((entry) => ({ ...entry, name: entry.name + ' renamed' }))} />,
    ),
  );
  expect(order.draftIds).toBe(draft);
});

it('commits the latest draft through a retained commit after two successive moves', async () => {
  act(() => renderer.update(<Probe models={[model('A'), model('B'), model('C')]} />));
  act(() => order.start());
  act(() => order.moveUp('p::B'));
  const retainedCommit = order.commit;
  act(() => order.moveModel('p::C', { before: 'p::B' }));
  const latestDraft = ['p::C', 'p::B', 'p::A'];
  expect(order.draftIds).toEqual(latestDraft);
  await act(async () => {
    expect(await retainedCommit()).toBe(true);
  });
  expect(mockTrigger).toHaveBeenCalledWith({
    body: {
      moves: [
        { id: 'p::C', anchor: { before: 'p::B' } },
        { id: 'p::A', anchor: { after: 'p::B' } },
      ],
    },
  });
  expect(order.isReordering).toBe(false);
  expect(order.commit).toBe(retainedCommit);
});

it('refuses an authoritative order newer than the draft cache and rebases without a batch', async () => {
  act(() => renderer.update(<Probe models={[model('A'), model('B'), model('C')]} />));
  act(() => order.start());
  act(() => order.moveUp('p::C'));
  const newer = [model('B'), model('A'), model('C'), model('D')];
  const key = queryKeys.models.list({ providerId: 'p' });
  mockQueryClient.setQueryData(key, newer);
  mockGet.mockResolvedValueOnce(newer);
  expect(await commit()).toBe(false);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(mockGet).toHaveBeenCalledWith('/models', { query: { providerId: 'p' } });
  expect(mockQueryClient.getQueryData(key)).toEqual(newer);
  expect(order.draftIds).toEqual(['p::A', 'p::C', 'p::B', 'p::D']);
  expect(order.isReordering).toBe(true);
  expect(order.isSaving).toBe(false);
});

it('keeps a draft for retry when the authoritative read fails and locks before that read', async () => {
  let failRead!: (error: Error) => void;
  mockGet.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failRead = reject;
      }),
  );
  act(() => order.start());
  act(() => order.moveUp('p::C'));
  const draft = order.draftIds;
  const key = queryKeys.models.list({ providerId: 'p' });
  mockQueryClient.setQueryData(key, baseline);
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = order.commit();
    expect(await order.commit()).toBe(false);
    order.moveDown('p::A');
  });
  expect(order.isSaving).toBe(true);
  expect(order.draftIds).toBe(draft);
  await act(async () => {
    failRead(new Error('read failed'));
    expect(await saving).toBe(false);
  });
  expect(mockQueryClient.getQueryState(key)?.status).toBe('success');
  expect(mockQueryClient.getQueryData(key)).toEqual(baseline);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(order.draftIds).toBe(draft);
  expect(order.isSaving).toBe(false);
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.failed',
    variant: 'danger',
  });
  expect(await commit()).toBe(true);
});

it('does not admit reorder when every visible group is a singleton, even with hidden models', () => {
  const hidden = { ...model('embedding'), capabilities: [MODEL_CAPABILITY.EMBEDDING] };
  act(() => renderer.update(<Probe models={[model('A'), model('P1', true), hidden]} />));
  expect(order.canReorder).toBe(false);
  act(() => order.start());
  expect(order.isReordering).toBe(false);
  expect(order.canMoveUp('p::A')).toBe(false);
  expect(order.canMoveDown('p::A')).toBe(false);
  expect(order.canMoveUp('p::P1')).toBe(false);
  expect(order.canMoveDown('p::P1')).toBe(false);
  act(() =>
    renderer.update(<Probe models={[model('A'), model('B'), model('P1', true), hidden]} />),
  );
  expect(order.canReorder).toBe(true);
  expect(order.positionOf('p::P1')).toEqual({ position: 1, total: 1 });
});
it('announces a successful draft move with its group position and size, but not a no-op', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  expect(order.positionOf('p::A')).toEqual({ position: 2, total: 3 });
  expect(announce).toHaveBeenLastCalledWith(
    'settings.provider.models.reorder.moved:{"model":"A","position":2,"total":3}',
  );
  const count = announce.mock.calls.length;
  act(() => order.moveModel('p::A', { after: 'p::B' }));
  expect(announce).toHaveBeenCalledTimes(count);
  announce.mockRestore();
});

it('keeps the save lock after a sibling list failure until the authoritative provider list settles', async () => {
  const listKey = queryKeys.models.list({ providerId: 'p' });
  const siblingKey = queryKeys.models.list({ providerId: 'p', isSystemSupported: true });
  let finishList!: (models: Model[]) => void;
  let failSibling!: (error: Error) => void;
  const pendingList = new Promise<Model[]>((resolve) => {
    finishList = resolve;
  });
  const pendingSibling = new Promise<Model[]>((_resolve, reject) => {
    failSibling = reject;
  });
  let refreshing = false;
  mockGet.mockImplementation(() => (refreshing ? pendingList : Promise.resolve(baseline)));
  const listFn = () => mockGet();
  const siblingFn = () => (refreshing ? pendingSibling : Promise.resolve(baseline));
  await Promise.all([
    mockQueryClient.fetchQuery({ queryKey: listKey, queryFn: listFn, staleTime: Infinity }),
    mockQueryClient.fetchQuery({ queryKey: siblingKey, queryFn: siblingFn, staleTime: Infinity }),
  ]);
  const observers = [
    new QueryObserver(mockQueryClient, { queryKey: listKey, queryFn: listFn, staleTime: Infinity }),
    new QueryObserver(mockQueryClient, {
      queryKey: siblingKey,
      queryFn: siblingFn,
      staleTime: Infinity,
    }),
  ];
  const unsubscribes = observers.map((observer) => observer.subscribe(() => undefined));
  mockTrigger.mockImplementationOnce(async () => {
    refreshing = true;
  });
  mockRefresh.mockImplementationOnce((...args: unknown[]) =>
    jest
      .requireActual('../../utils/refreshProviderModelQueries')
      .refreshProviderModelQueries(...args),
  );
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  const draft = order.draftIds;
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = order.commit();
  });
  try {
    await act(async () => {
      failSibling(new Error('supported model list failed'));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(mockQueryClient.getQueryState(listKey)?.fetchStatus).toBe('fetching');
    expect(mockQueryClient.getQueryState(siblingKey)?.status).toBe('error');
    expect(order.isSaving).toBe(true);
    expect(mockToast).not.toHaveBeenCalledWith({
      label: 'settings.provider.models.reorder.refreshFailed',
      variant: 'danger',
    });
    act(() => {
      order.start();
      order.moveDown('p::A');
      order.cancel();
    });
    expect(order.draftIds).toBe(draft);
    expect(await commit()).toBe(false);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      finishList(baseline);
      await saving;
    });
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  }
  expect(order.isSaving).toBe(false);
  expect(order.isReordering).toBe(false);
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.refreshFailed',
    variant: 'danger',
  });
  expect(mockTrigger).toHaveBeenCalledTimes(1);
});

it('clears the saved draft and unlocks with a failure toast when refresh does not settle', async () => {
  jest.useFakeTimers();
  let finishList!: (models: Model[]) => void;
  const pendingList = new Promise<Model[]>((resolve) => {
    finishList = resolve;
  });
  let refreshing = false;
  mockGet.mockImplementation(() => (refreshing ? pendingList : Promise.resolve(baseline)));
  const listKey = queryKeys.models.list({ providerId: 'p' });
  const listFn = () => mockGet();
  await mockQueryClient.fetchQuery({ queryKey: listKey, queryFn: listFn, staleTime: Infinity });
  const observer = new QueryObserver(mockQueryClient, {
    queryKey: listKey,
    queryFn: listFn,
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  mockTrigger.mockImplementationOnce(async () => {
    refreshing = true;
  });
  mockRefresh.mockImplementationOnce((...args: unknown[]) =>
    jest
      .requireActual('../../utils/refreshProviderModelQueries')
      .refreshProviderModelQueries(...args),
  );
  let saving!: Promise<boolean>;
  try {
    act(() => order.start());
    act(() => order.moveUp('p::C'));
    await act(async () => {
      saving = order.commit();
    });
    expect(order.isSaving).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mockQueryClient.getQueryState(listKey)?.fetchStatus).toBe('fetching');
    expect(order.isSaving).toBe(false);
    expect(order.isReordering).toBe(false);
    expect(await saving).toBe(true);
    expect(mockToast).toHaveBeenLastCalledWith({
      label: 'settings.provider.models.reorder.refreshFailed',
      variant: 'danger',
    });
  } finally {
    await act(async () => {
      finishList(baseline);
      await saving;
    });
    unsubscribe();
    jest.useRealTimers();
  }
});

it('refuses and rebases against a direct snapshot instead of joining an older in-flight read', async () => {
  const older = [model('A'), model('B'), model('C')];
  act(() => renderer.update(<Probe models={older} />));
  act(() => order.start());
  act(() => order.moveUp('p::B'));
  const key = queryKeys.models.list({ providerId: 'p' });
  mockQueryClient.setQueryData(key, older);
  let finishOlder!: (models: Model[]) => void;
  mockGet.mockImplementationOnce(
    () =>
      new Promise<Model[]>((resolve) => {
        finishOlder = resolve;
      }),
  );
  const oldRead = mockQueryClient.fetchQuery({
    queryKey: key,
    queryFn: () => mockGet('/models', { query: { providerId: 'p' } }),
    staleTime: 0,
  });
  expect(mockQueryClient.getQueryState(key)?.fetchStatus).toBe('fetching');
  // The database loses A after the older read has already started.
  const authoritative = [model('B'), model('C')];
  mockGet.mockResolvedValue(authoritative);
  let saving!: Promise<boolean>;
  let refused: boolean | undefined;
  await act(async () => {
    saving = order.commit().then((result) => {
      refused = result;
      return result;
    });
  });
  const published = mockQueryClient.getQueryData(key);
  const rebased = order.draftIds;
  const stillFetching = mockQueryClient.getQueryState(key)?.fetchStatus;
  // Always settle the independent screen fetch, including in the negative control.
  await act(async () => {
    finishOlder(older);
    await oldRead;
    await saving;
  });
  expect(refused).toBe(false);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(published).toEqual(authoritative);
  expect(rebased).toEqual(['p::B', 'p::C']);
  expect(stillFetching).toBe('fetching');
  expect(mockGet).toHaveBeenCalledTimes(2);
  expect(order.isReordering).toBe(true);
});

it('unlocks a stalled preflight after the bound without a batch and preserves a retryable draft', async () => {
  jest.useFakeTimers();
  let finishRead!: (models: Model[]) => void;
  mockGet.mockImplementationOnce(
    () =>
      new Promise<Model[]>((resolve) => {
        finishRead = resolve;
      }),
  );
  let saving!: Promise<boolean>;
  try {
    act(() => order.start());
    act(() => order.moveUp('p::C'));
    const draft = order.draftIds;
    await act(async () => {
      saving = order.commit();
    });
    expect(order.isSaving).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(9_999);
    });
    expect(order.isSaving).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(order.isSaving).toBe(false);
    expect(await saving).toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(order.draftIds).toEqual(draft);
    expect(order.isReordering).toBe(true);
    expect(mockToast).toHaveBeenLastCalledWith({
      label: 'settings.provider.models.reorder.failed',
      variant: 'danger',
    });
    // A late completion must not resume the expired commit or overwrite the screen cache.
    await act(async () => {
      finishRead([model('deleted')]);
    });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(
      mockQueryClient.getQueryData(queryKeys.models.list({ providerId: 'p' })),
    ).toBeUndefined();
    expect(await commit()).toBe(true);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  } finally {
    // Also clean up the deliberately unbounded negative control without a hanging test.
    await act(async () => {
      finishRead(baseline);
      await saving;
    });
    jest.useRealTimers();
  }
});

it('unlocks a paused preflight without a batch and keeps cancel usable', async () => {
  const key = queryKeys.models.list({ providerId: 'p' });
  mockQueryClient.setQueryData(key, baseline);
  mockQueryClient.getQueryCache().find({ queryKey: key })!.setState({ fetchStatus: 'paused' });
  mockGet.mockImplementationOnce(() => new Promise<Model[]>(() => undefined));
  act(() => order.start());
  act(() => order.moveUp('p::C'));
  const draft = order.draftIds;
  expect(await commit()).toBe(false);
  expect(order.isSaving).toBe(false);
  expect(order.draftIds).toEqual(draft);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.failed',
    variant: 'danger',
  });
  act(() => order.cancel());
  expect(order.isReordering).toBe(false);
});

it('composes two moves in one tick and commits the composed draft', async () => {
  act(() => renderer.update(<Probe models={[model('A'), model('B'), model('C')]} />));
  act(() => order.start());
  act(() => {
    order.moveUp('p::B');
    order.moveModel('p::C', { before: 'p::B' });
  });
  expect(order.draftIds).toEqual(['p::C', 'p::B', 'p::A']);
  expect(await commit()).toBe(true);
  expect(mockTrigger).toHaveBeenCalledWith({
    body: {
      moves: [
        { id: 'p::C', anchor: { before: 'p::B' } },
        { id: 'p::A', anchor: { after: 'p::B' } },
      ],
    },
  });
});
