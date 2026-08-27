import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';
import {
  SESSION_WEB_SEARCH_SELECTION_CACHE_KEY,
  persistSessionWebSearchSelection,
} from '@/frontend/features/chat/sessionWebSearchSelection';

import { useChatInputWebSearchSelection } from '../useChatInputWebSearchSelection';

type Snapshot = ReturnType<typeof useChatInputWebSearchSelection>;

describe('useChatInputWebSearchSelection', () => {
  beforeEach(() => {
    cacheService.deletePersist(SESSION_WEB_SEARCH_SELECTION_CACHE_KEY);
  });

  test('persists the selection independently for each established Session', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-1"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          sessionId="session-1"
        />,
      );
    });
    await act(async () => snapshot?.setIsWebSearchEnabled(true));

    expect(snapshot?.isWebSearchEnabled).toBe(true);
    expect(cacheService.getPersist(SESSION_WEB_SEARCH_SELECTION_CACHE_KEY)).toEqual(['session-1']);

    await act(async () => {
      renderer?.update(
        <Harness
          agentId="agent-1"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          sessionId="session-2"
        />,
      );
    });
    expect(snapshot?.isWebSearchEnabled).toBe(false);

    await act(async () => renderer?.unmount());
  });

  test('keeps a new Session draft local until creation assigns an id', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <Harness
          agentId="agent-1"
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });
    await act(async () => snapshot?.setIsWebSearchEnabled(true));

    expect(snapshot?.isWebSearchEnabled).toBe(true);
    expect(cacheService.getPersist(SESSION_WEB_SEARCH_SELECTION_CACHE_KEY)).toEqual([]);

    await act(async () => {
      persistSessionWebSearchSelection('session-1', true);
      renderer?.update(
        <Harness
          agentId="agent-1"
          onSnapshot={(value) => {
            snapshot = value;
          }}
          sessionId="session-1"
        />,
      );
    });
    expect(snapshot?.isWebSearchEnabled).toBe(true);

    await act(async () => {
      renderer?.update(
        <Harness
          agentId="agent-1"
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });
    expect(snapshot?.isWebSearchEnabled).toBe(false);

    await act(async () => renderer?.unmount());
  });
});

function Harness({
  agentId,
  onSnapshot,
  sessionId,
}: {
  agentId?: string;
  onSnapshot: (snapshot: Snapshot) => void;
  sessionId?: string;
}) {
  const snapshot = useChatInputWebSearchSelection({ agentId, sessionId });

  useEffect(() => onSnapshot(snapshot), [onSnapshot, snapshot]);
  return null;
}
