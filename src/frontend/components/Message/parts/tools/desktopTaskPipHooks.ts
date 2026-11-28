import { useMemo, useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { RemoteAgentModule } from '@/shared/contracts/remoteAgent';

import { buildDesktopTaskPipViewModel, type DesktopTaskPipViewModel } from './desktopTaskPipModel';

export const DESKTOP_TASK_PIP_STATUS_KEYS = {
  running: 'desktopDispatch.pip.status.running',
  'awaiting-approval': 'desktopDispatch.pip.status.awaiting-approval',
  completed: 'desktopDispatch.pip.status.completed',
  failed: 'desktopDispatch.pip.status.failed',
  offline: 'desktopDispatch.pip.status.offline',
  'pending-confirm': 'desktopDispatch.pip.status.pending-confirm',
  dispatched: 'desktopDispatch.pip.status.dispatched',
} as const satisfies Record<DesktopTaskPipViewModel['state'], string>;

type RemoteObserver<TSnapshot> = {
  read(agent: RemoteAgentModule): TSnapshot | undefined;
  subscribe(agent: RemoteAgentModule, listener: () => void): (() => void) | undefined;
};

function liveSessionObserver(connectionId: string | undefined, sessionId: string | undefined) {
  if (!connectionId || !sessionId) return undefined;
  return {
    read: (agent) => agent.peekLiveSession?.(connectionId, sessionId),
    subscribe: (agent, listener) => agent.subscribeLiveSession?.(connectionId, sessionId, listener),
  } satisfies RemoteObserver<ReturnType<NonNullable<RemoteAgentModule['peekLiveSession']>>>;
}

function dispatchObserver(
  connectionId: string | undefined,
  draftId: string | undefined,
  operationId: string | undefined,
) {
  if (!connectionId || !draftId || !operationId) return undefined;
  return {
    read: (agent) => agent.peekDispatch?.(connectionId, draftId, operationId),
    subscribe: (agent, listener) => agent.subscribeDispatches?.(connectionId, listener),
  } satisfies RemoteObserver<ReturnType<NonNullable<RemoteAgentModule['peekDispatch']>>>;
}

function useRemoteSnapshots<TSnapshot>(
  observers: readonly (RemoteObserver<TSnapshot> | undefined)[],
) {
  const agent = useBackendModule('remoteAgent');
  const store = useMemo(() => {
    let snapshots: (TSnapshot | undefined)[] = [];
    return {
      getSnapshot: () => {
        const next = observers.map((observer) => (agent ? observer?.read(agent) : undefined));
        if (next.length !== snapshots.length || next.some((value, i) => value !== snapshots[i])) {
          snapshots = next;
        }
        return snapshots;
      },
      subscribe: (listener: () => void) => {
        const stops = agent
          ? observers.map((observer) => observer?.subscribe(agent, listener))
          : [];
        return () => {
          for (const stop of stops) stop?.();
        };
      },
    };
  }, [agent, observers]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useLiveRemoteSessionPreview(
  connectionId: string | undefined,
  sessionId: string | undefined,
) {
  const observers = useMemo(
    () => [liveSessionObserver(connectionId, sessionId)],
    [connectionId, sessionId],
  );
  return useRemoteSnapshots(observers)[0];
}

export function useRecoveredRemoteDispatch(
  connectionId: string | undefined,
  draftId: string | undefined,
  operationId: string | undefined,
) {
  const observers = useMemo(
    () => [dispatchObserver(connectionId, draftId, operationId)],
    [connectionId, draftId, operationId],
  );
  return useRemoteSnapshots(observers)[0];
}

/** Read the same receipt and live sources as the inline PiP, even when the drawer is closed. */
export function useDesktopTaskPipViews(
  dispatches: readonly { input: unknown; output: unknown; view: DesktopTaskPipViewModel }[],
) {
  const dispatchesToRecover = useMemo(
    () =>
      dispatches.map(({ view }) =>
        view.state === 'pending-confirm' && !view.sessionId
          ? dispatchObserver(view.connectionId, view.draftId, view.operationId)
          : undefined,
      ),
    [dispatches],
  );
  const recovered = useRemoteSnapshots(dispatchesToRecover);
  const sessionObservers = useMemo(
    () =>
      dispatches.map(({ view }, i) =>
        liveSessionObserver(view.connectionId, view.sessionId ?? recovered[i]?.sessionId),
      ),
    [dispatches, recovered],
  );
  const previews = useRemoteSnapshots(sessionObservers);
  return dispatches.map(({ input, output, view }, i) =>
    recovered[i] || previews[i]
      ? buildDesktopTaskPipViewModel({
          input,
          output,
          livePreview: previews[i],
          recoveredDispatch: recovered[i],
        })
      : view,
  );
}
