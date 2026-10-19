import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ConversationSource,
  ConversationSummary,
  OperationOutcome,
} from '@/frontend/appShell/conversation';

import { SidebarSelectionProvider, useSidebarSelection } from '../SidebarSelectionProvider';

const mockConfirm = jest.fn();
const mockToast = jest.fn();
const mockProgress = { set: jest.fn() };
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { fast: 1 },
  easing: { settle: undefined },
}));
jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => 'open' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/components/Selection', () =>
  jest.requireActual('@/frontend/components/Selection/selection'),
);
jest.mock('react-native-reanimated', () => ({
  cancelAnimation: jest.fn(),
  ReduceMotion: { System: 'system' },
  useSharedValue: () => mockProgress,
  withTiming: (value: number) => value,
}));

let selection: ReturnType<typeof useSidebarSelection>;
let renderer: ReactTestRenderer;
function Probe() {
  const current = useSidebarSelection();
  useLayoutEffect(() => {
    selection = current;
  });
  return null;
}

function register(refresh: () => Promise<unknown>) {
  const remove = jest.fn(
    async (_sessionId: string): Promise<OperationOutcome<void>> => ({
      state: 'applied',
      value: undefined,
    }),
  );
  const source: ConversationSource = {
    ref: { kind: 'local' },
    scope: 'local' as ConversationSource['scope'],
    state: {
      getSnapshot: () => ({ availability: { state: 'enabled' } }),
      subscribe: () => () => {},
    },
    catalog: {
      listAgents: async () => ({ items: [] }),
      listSessions: async () => ({ items: [] }),
      previewSession: (ref) => ({
        remove: {
          availability: { state: 'enabled' },
          execute: () => remove(ref.sessionId),
        },
      }),
    },
    dispose() {},
  };
  const sessions: ConversationSummary[] = ['first', 'second'].map((sessionId) => ({
    ref: { source: source.ref, sessionId },
    agentId: 'agent',
    title: sessionId,
  }));
  act(() => {
    selection.registerList('sessions', source, sessions, refresh);
    selection.enter();
    selection.toggleAll();
    selection.requestDelete();
  });
  return { remove, confirm: mockConfirm.mock.calls.at(-1)![0].onConfirm as () => void };
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    renderer = create(
      <SidebarSelectionProvider scope="local">
        <Probe />
      </SidebarSelectionProvider>,
    );
  });
});
afterEach(() => act(() => renderer.unmount()));

test('waits for serial deletions, then unlocks without waiting for catalog refresh', async () => {
  const deletion = Promise.withResolvers<OperationOutcome<void>>();
  const refresh = Promise.withResolvers<void>();
  const { remove, confirm } = register(() => refresh.promise);
  remove.mockImplementationOnce(() => deletion.promise);

  act(confirm);
  expect(selection.getSnapshot().isDeleting).toBe(true);
  expect(remove.mock.calls).toEqual([['first']]);
  await act(async () => {
    deletion.resolve({ state: 'applied', value: undefined });
  });

  expect(remove.mock.calls).toEqual([['first'], ['second']]);
  expect(selection.getSnapshot()).toMatchObject({ isDeleting: false, isSelecting: false });
  expect(selection.shownIds()).toEqual([]);
  expect(mockToast).toHaveBeenCalledWith({
    label: 'session.selection.deleted',
    variant: 'success',
  });
  refresh.resolve();
  await refresh.promise;
});

test('keeps failed deletions selected even when refreshing throws synchronously', async () => {
  const { remove, confirm } = register(() => {
    throw new Error('Catalog unavailable');
  });
  remove.mockRejectedValueOnce(new Error('Could not stop the running turn'));
  await act(async () => confirm());

  const state = selection.getSnapshot();
  expect(state.isDeleting).toBe(false);
  expect(state.isSelecting).toBe(true);
  expect(state.selectedIds).toEqual(new Set([JSON.stringify(['local', 'first'])]));
  expect(selection.shownIds()).toEqual([JSON.stringify(['local', 'first'])]);
  expect(mockToast).toHaveBeenCalledWith({
    label: 'session.selection.deleteFailed',
    variant: 'danger',
  });
});
