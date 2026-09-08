import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';
import type { AgentSessionStatus } from '@/shared/contracts/agent';

import { useAgentSessionStatus } from '../useAgentSessionStatus';

const mockSnapshots = new Map<string, AgentSessionStatus>();
const mockListeners = new Map<string, Set<() => void>>();
const mockAgent = {
  getSessionStatus: (sessionId: string) => mockSnapshots.get(sessionId) ?? null,
  subscribeSessionStatus: (sessionId: string, listener: () => void) => {
    const listeners = mockListeners.get(sessionId) ?? new Set();
    mockListeners.set(sessionId, listeners);
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockAgent,
  useCache: jest.requireActual('@/frontend/data/hooks/useCache').useCache,
}));

let states: Record<string, ReturnType<typeof useAgentSessionStatus>>;
let renderer: ReactTestRenderer | undefined;

function Probe({ name, sessionId }: { name: string; sessionId: string }) {
  states[name] = useAgentSessionStatus(sessionId);
  return null;
}

function publish(sessionId: string, turnId: string, status: AgentSessionStatus['status']) {
  act(() => {
    mockSnapshots.set(sessionId, { status, turnId });
    mockListeners.get(sessionId)?.forEach((listener) => listener());
  });
}

beforeEach(() => {
  states = {};
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  cacheService.cleanup();
  mockSnapshots.clear();
  mockListeners.clear();
});

test('shares each completion receipt across list views and requires a new receipt for the next turn', () => {
  act(() => {
    renderer = create(
      <>
        <Probe name="list" sessionId="a" />
        <Probe name="sidebar" sessionId="a" />
        <Probe name="other" sessionId="b" />
      </>,
    );
  });

  publish('a', 'turn-1', 'running');
  act(() => states.list.markSeen());
  publish('a', 'turn-1', 'completed');
  publish('b', 'turn-b', 'completed');
  expect(states.list.isUnread).toBe(true);
  expect(states.sidebar.isUnread).toBe(true);

  act(() => states.list.markSeen());
  expect(states.list.isUnread).toBe(false);
  expect(states.sidebar.isUnread).toBe(false);
  expect(states.other.isUnread).toBe(true);

  act(() => renderer?.unmount());
  act(() => {
    renderer = create(<Probe name="remounted" sessionId="a" />);
  });
  expect(states.remounted.isUnread).toBe(false);

  publish('a', 'turn-2', 'completed');
  expect(states.remounted.isUnread).toBe(true);
});

test('switches subscriptions when a recycled row changes Session and never marks non-success as unread', () => {
  act(() => {
    renderer = create(<Probe name="row" sessionId="a" />);
  });
  publish('a', 'turn-a', 'completed');
  expect(states.row.isUnread).toBe(true);

  act(() => renderer?.update(<Probe name="row" sessionId="b" />));
  expect(mockListeners.get('a')?.size).toBe(0);
  expect(states.row).toMatchObject({ isUnread: false, status: undefined });

  publish('a', 'turn-a2', 'completed');
  expect(states.row).toMatchObject({ isUnread: false, status: undefined });
  for (const status of ['awaiting-approval', 'failed', 'cancelled', 'interrupted'] as const) {
    publish('b', 'turn-b', status);
    expect(states.row).toMatchObject({ isUnread: false, status });
  }
});
