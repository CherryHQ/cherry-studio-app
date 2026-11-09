import { useLayoutEffect } from 'react';
import { BackHandler } from 'react-native';
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
let mockSidebarPresence = 'open';
jest.mock('../hooks/useSidebarPresence', () => ({
  useSidebarPresence: () => mockSidebarPresence,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/appShell/navigation', () =>
  jest.requireActual('@/frontend/appShell/navigation/useFocusedBackPress'),
);
let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
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

function createCatalog() {
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
  return { source, sessions, remove };
}

function register() {
  const { source, sessions, remove } = createCatalog();
  let unregister!: () => void;
  act(() => {
    unregister = selection.registerList('sessions', source, sessions);
    selection.enter();
    selection.toggleAll();
    selection.requestDelete();
  });
  return {
    source,
    sessions,
    remove,
    unregister,
    confirm: mockConfirm.mock.calls.at(-1)![0].onConfirm as () => void,
  };
}

function renderProvider() {
  return (
    <SidebarSelectionProvider scope="local">
      <Probe />
    </SidebarSelectionProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockSidebarPresence = 'open';
  act(() => {
    renderer = create(renderProvider());
  });
});
afterEach(() => act(() => renderer.unmount()));

test('deletes serially, then unlocks with deleted rows hidden', async () => {
  const deletion = Promise.withResolvers<OperationOutcome<void>>();
  const { remove, confirm } = register();
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
});

test('drops selection entries when the catalog stops showing a session', async () => {
  const { source, sessions, remove } = createCatalog();
  let unregister!: () => void;
  act(() => {
    unregister = selection.registerList('sessions', source, sessions);
    selection.enter();
    selection.toggleAll();
  });
  act(() => {
    selection.registerList('sessions', source, sessions.slice(0, 1));
    unregister();
  });

  const first = JSON.stringify(['local', 'first']);
  const second = JSON.stringify(['local', 'second']);
  expect(selection.shownIds()).toEqual([first]);
  expect(selection.selectedEntries().map((entry) => entry.ref.sessionId)).toEqual(['first']);
  expect(selection.getSnapshot().selectedIds).toEqual(new Set([first]));

  act(() => {
    selection.toggle(second);
    selection.enter(second);
  });
  expect(selection.getSnapshot().selectedIds).toEqual(new Set([first]));

  await act(async () => {
    selection.requestDelete();
    mockConfirm.mock.calls.at(-1)![0].onConfirm();
  });
  expect(remove.mock.calls).toEqual([['first']]);
});

test('drops the selection when its list unregisters', () => {
  const { source, sessions, remove } = createCatalog();
  let unregister!: () => void;
  act(() => {
    unregister = selection.registerList('sessions', source, sessions);
    selection.enter();
    selection.toggleAll();
  });
  act(() => unregister());

  expect(selection.shownIds()).toEqual([]);
  expect(selection.selectedEntries()).toEqual([]);
  expect(selection.getSnapshot().selectedIds.size).toBe(0);

  act(() => {
    selection.enter(JSON.stringify(['local', 'first']));
    selection.requestDelete();
  });
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test.each(['update', 'unregister'] as const)(
  'preserves selections still owned by another list after %s',
  (change) => {
    const { source, sessions } = createCatalog();
    let unregister!: () => void;
    let unregisterShared!: () => void;
    act(() => {
      unregister = selection.registerList('sessions', source, sessions);
      unregisterShared = selection.registerList('shared', source, sessions.slice(1));
      selection.enter();
      selection.toggleAll();
    });
    act(() => {
      if (change === 'update') selection.registerList('sessions', source, sessions.slice(0, 1));
      else unregister();
    });

    const remaining = change === 'update' ? ['first', 'second'] : ['second'];
    expect(selection.selectedEntries().map((entry) => entry.ref.sessionId)).toEqual(remaining);
    expect(selection.getSnapshot().selectedIds).toEqual(
      new Set(remaining.map((id) => JSON.stringify(['local', id]))),
    );

    act(() => unregisterShared());
    expect(selection.selectedEntries().map((entry) => entry.ref.sessionId)).toEqual(
      change === 'update' ? ['first'] : [],
    );
  },
);

test('keeps failed deletions selected for retry', async () => {
  const { source, sessions, remove, confirm } = register();
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

  act(() => {
    selection.registerList('sessions', source, sessions);
  });
  expect(selection.getSnapshot().selectedIds).toEqual(state.selectedIds);
  expect(selection.shownIds()).toEqual([JSON.stringify(['local', 'first'])]);
});

test('does not restore vanished selections when a pending deletion fails', async () => {
  const deletion = Promise.withResolvers<OperationOutcome<void>>();
  const { remove, confirm, unregister } = register();
  remove.mockImplementationOnce(() => deletion.promise);

  act(confirm);
  act(() => unregister());
  await act(async () => {
    deletion.reject(new Error('Could not stop the running turn'));
  });

  expect(selection.getSnapshot()).toMatchObject({ isDeleting: false, isSelecting: false });
  expect(selection.getSnapshot().selectedIds.size).toBe(0);
  expect(selection.selectedEntries()).toEqual([]);
  expect(selection.shownIds()).toEqual([]);
});

test('keeps a selection beside a permanent sidebar and ends it once the sidebar is hidden', () => {
  act(() => selection.enter());

  mockSidebarPresence = 'persistent';
  act(() => renderer.update(renderProvider()));
  expect(selection.getSnapshot().isSelecting).toBe(true);

  mockSidebarPresence = 'closed';
  act(() => renderer.update(renderProvider()));
  expect(selection.getSnapshot().isSelecting).toBe(false);
});

test('leaves back to a route pushed beside a permanent sidebar while selecting', () => {
  // The latest subscription runs first, as on Android.
  const backListeners: Parameters<typeof BackHandler.addEventListener>[1][] = [];
  const addListener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, listener) => {
      backListeners.push(listener);
      return { remove: () => backListeners.splice(backListeners.indexOf(listener), 1) };
    });
  const pressBack = () =>
    act(() => {
      backListeners
        .toReversed()
        .some((listener) => listener({ timeStamp: 0, type: 'hardwareBackPress' }));
    });
  const navigatorBack = jest.fn(() => true);
  backListeners.push(navigatorBack);
  mockSidebarPresence = 'persistent';
  act(() => renderer.update(renderProvider()));
  act(() => selection.enter());

  mockFocused = false;
  act(() => renderer.update(renderProvider()));
  pressBack();
  expect(navigatorBack).toHaveBeenCalledTimes(1);
  expect(selection.getSnapshot().isSelecting).toBe(true);

  mockFocused = true;
  act(() => renderer.update(renderProvider()));
  pressBack();
  expect(navigatorBack).toHaveBeenCalledTimes(1);
  expect(selection.getSnapshot().isSelecting).toBe(false);
  addListener.mockRestore();
});
