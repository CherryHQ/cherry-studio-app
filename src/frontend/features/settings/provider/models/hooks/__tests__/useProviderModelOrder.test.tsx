import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Model } from '@/shared/data/types/model';

import { useProviderModelOrder } from '../useProviderModelOrder';

const mockTrigger = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();
const mockInvalidate = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidate };
jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ trigger: mockTrigger }),
  queryKeys: { models: { list: (query?: object) => ['/models', query] } },
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: object) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));
jest.mock('../../utils/refreshProviderModelQueries', () => ({
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
  mockRefresh.mockResolvedValue(undefined);
  mount();
});
afterEach(() => {
  act(() => renderer.unmount());
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

it('refuses a retained commit built against a different observed order and rebases without sending', async () => {
  act(() => order.start());
  act(() => order.moveDown('p::A'));
  const retainedCommit = order.commit;
  act(() => renderer.update(<Probe models={[model('C'), model('B'), model('A'), model('D')]} />));
  let result: boolean | undefined;
  await act(async () => {
    result = await retainedCommit();
  });
  expect(result).toBe(false);
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(order.draftIds).toEqual(['p::B', 'p::A', 'p::C', 'p::D']);
  expect(order.isReordering).toBe(true);
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

it('keeps editing and duplicate saves locked after a detail failure until the provider list settles', async () => {
  let finishList!: () => void;
  const list = new Promise<void>((resolve) => {
    finishList = resolve;
  });
  mockInvalidate
    .mockImplementationOnce(() => Promise.reject(new Error('detail failed')))
    .mockImplementationOnce(() => list)
    .mockResolvedValue(undefined);
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
    expect(order.isSaving).toBe(true);
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
      finishList();
      await saving;
    });
  }
  expect(order.isSaving).toBe(false);
  expect(order.isReordering).toBe(false);
  expect(mockToast).toHaveBeenLastCalledWith({
    label: 'settings.provider.models.reorder.refreshFailed',
    variant: 'danger',
  });
  expect(mockTrigger).toHaveBeenCalledTimes(1);
});
