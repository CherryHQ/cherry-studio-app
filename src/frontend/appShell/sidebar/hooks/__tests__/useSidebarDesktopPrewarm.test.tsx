import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { useSidebarDesktopPrewarm } from '../useSidebarDesktopPrewarm';
import type { SidebarPresence } from '../useSidebarPresence';

let mockPresence: SidebarPresence = 'closed';
const mockPrewarm = jest.fn(
  async (_id: string, _view: 'agents' | 'sessions', _signal: AbortSignal) => undefined,
);
const mockRemoteAgent = { prewarm: mockPrewarm };

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockRemoteAgent,
}));
jest.mock('../useSidebarPresence', () => ({
  useSidebarPresence: () => mockPresence,
}));

function desktop(id: string, overrides: Partial<DesktopConnection> = {}): DesktopConnection {
  return {
    alias: null,
    capabilities: ['agent'],
    configuredEndpoints: [],
    defaultName: id,
    id,
    lastFetchedAt: null,
    name: id,
    status: 'paired',
    ...overrides,
  };
}

function Probe({
  connections,
  view = 'agents',
  currentId,
}: {
  connections: readonly DesktopConnection[];
  view?: 'agents' | 'sessions';
  currentId?: string;
}) {
  useSidebarDesktopPrewarm(connections, view, currentId);
  return null;
}

describe('useSidebarDesktopPrewarm', () => {
  let renderer: ReactTestRenderer | undefined;
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  const removeSubscription = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPresence = 'closed';
    appStateListener = undefined;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener as (state: AppStateStatus) => void;
      return { remove: removeSubscription } as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  function render(props: Parameters<typeof Probe>[0]) {
    act(() => {
      if (renderer) renderer.update(<Probe {...props} />);
      else renderer = create(<Probe {...props} />);
    });
  }

  it.each(['closed', 'persistent'] as const)(
    'does not prewarm when sidebar presence is %s',
    (presence) => {
      mockPresence = presence;
      render({ connections: [desktop('pc-1')] });
      expect(mockPrewarm).not.toHaveBeenCalled();
    },
  );

  it('prewarms the sole eligible desktop on open, aborts on close/background, and keeps the same attempt on selection', () => {
    const connections = [desktop('pc-1')];
    mockPresence = 'open';
    render({ connections, view: 'agents' });

    expect(mockPrewarm).toHaveBeenCalledTimes(1);
    const [id, view, firstSignal] = mockPrewarm.mock.calls[0]!;
    expect(id).toBe('pc-1');
    expect(view).toBe('agents');
    expect(firstSignal.aborted).toBe(false);

    // Selecting the already-prewarming desktop preserves the active attempt.
    render({ connections, currentId: 'pc-1', view: 'agents' });
    expect(mockPrewarm).toHaveBeenCalledTimes(1);
    expect(firstSignal.aborted).toBe(false);

    act(() => appStateListener?.('background'));
    expect(firstSignal.aborted).toBe(true);

    act(() => appStateListener?.('active'));
    expect(mockPrewarm).toHaveBeenCalledTimes(2);
    const secondSignal = mockPrewarm.mock.calls[1]![2];
    expect(secondSignal.aborted).toBe(false);

    mockPresence = 'closed';
    render({ connections, currentId: 'pc-1', view: 'agents' });
    expect(secondSignal.aborted).toBe(true);
    expect(removeSubscription).toHaveBeenCalledTimes(1);
  });

  it('waits for selection when multiple eligible desktops exist and skips ineligible desktops', () => {
    const multiple = [
      desktop('pc-1'),
      desktop('pc-2'),
      desktop('broken', { status: 'needs-repair' }),
      desktop('no-agent', { capabilities: [] }),
    ];
    mockPresence = 'open';
    render({ connections: multiple });
    expect(mockPrewarm).not.toHaveBeenCalled();

    // Selecting an ineligible device still does not prewarm it.
    render({ connections: multiple, currentId: 'broken' });
    expect(mockPrewarm).not.toHaveBeenCalled();

    render({ connections: multiple, currentId: 'pc-2', view: 'sessions' });
    expect(mockPrewarm).toHaveBeenCalledTimes(1);
    expect(mockPrewarm).toHaveBeenCalledWith('pc-2', 'sessions', expect.any(AbortSignal));

    // Returning to local preserves the last selected eligible desktop for prewarming.
    render({ connections: multiple, view: 'sessions' });
    expect(mockPrewarm).toHaveBeenCalledTimes(1);
  });
});
