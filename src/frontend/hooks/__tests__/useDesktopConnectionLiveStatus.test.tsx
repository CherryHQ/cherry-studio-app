import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';

import { useDesktopConnectionLiveStatus } from '../useDesktopConnectionLiveStatus';

let mockLiveStatus: DesktopLiveStatus = { state: 'connected' };
const listeners = new Set<() => void>();

const mockGetConnectionLiveStatus = jest.fn((id: string) => mockLiveStatus);
const mockSubscribeConnectionLiveStatus = jest.fn((id: string, listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
});

jest.mock('@/frontend/data', () => ({
  useBackendModule: (key: string) => {
    if (key === 'desktopConnections') {
      return {
        getConnectionLiveStatus: mockGetConnectionLiveStatus,
        subscribeConnectionLiveStatus: mockSubscribeConnectionLiveStatus,
      };
    }
    return {};
  },
}));

let currentStatus: DesktopLiveStatus | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe({ connectionId }: { connectionId?: string }) {
  const status = useDesktopConnectionLiveStatus(connectionId);
  currentStatus = status;
  return null;
}

describe('useDesktopConnectionLiveStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    mockLiveStatus = { state: 'connected' };
    currentStatus = undefined;
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = undefined;
    }
  });

  it('handles missing or undefined connectionId with default unreachable state', async () => {
    await act(async () => {
      renderer = create(<Probe connectionId={undefined} />);
    });
    expect(currentStatus).toEqual({ state: 'unreachable', reason: 'no-location' });
    expect(mockSubscribeConnectionLiveStatus).not.toHaveBeenCalled();
  });

  it('subscribes and updates reactively when live connection status changes', async () => {
    mockLiveStatus = { state: 'connecting' };
    await act(async () => {
      renderer = create(<Probe connectionId="pc-1" />);
    });
    expect(currentStatus).toEqual({ state: 'connecting' });
    expect(mockSubscribeConnectionLiveStatus).toHaveBeenCalledWith('pc-1', expect.any(Function));

    // Transition to connected
    mockLiveStatus = { state: 'connected' };
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(currentStatus).toEqual({ state: 'connected' });

    // Transition to unreachable with failures
    mockLiveStatus = {
      state: 'unreachable',
      reason: 'unreachable',
      failures: [{ address: '192.168.1.5', kind: 'timeout' }],
    };
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(currentStatus).toEqual({
      state: 'unreachable',
      reason: 'unreachable',
      failures: [{ address: '192.168.1.5', kind: 'timeout' }],
    });
  });
});
