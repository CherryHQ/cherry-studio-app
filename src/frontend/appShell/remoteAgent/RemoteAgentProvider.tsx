import { ContentState } from '@cherrystudio/ui/components';
import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import type { AgentController } from '@/shared/contracts/agent/controller';

const Context = createContext<{ controller: AgentController; connectionId: string } | null>(null);
export function RemoteAgentProvider({
  children,
  connectionId,
  renderFallback,
}: PropsWithChildren<{
  connectionId: string;
  renderFallback?: (state: 'loading' | 'error') => ReactNode;
}>) {
  const { t } = useTranslation();
  const module = useBackendModule('agentController');
  const [sourceState, setSourceState] = useState<{
    id: string;
    controller?: AgentController;
    failed?: boolean;
  }>();
  useEffect(() => {
    let disposed = false;
    let opening = false;
    let source: AgentController | undefined;
    let unsubscribe: (() => void) | undefined;
    const open = () => {
      if (disposed || opening) return;
      opening = true;
      void module
        .open(connectionId)
        .then((opened) => {
          if (disposed) {
            opened.dispose();
            return;
          }
          unsubscribe?.();
          source?.dispose();
          source = opened;
          unsubscribe = opened.subscribeConnection(() => {
            if (opened.getConnection().status === 'closed') open();
          });
          setSourceState({ id: connectionId, controller: opened });
        })
        .catch(() => {
          if (!disposed) setSourceState({ id: connectionId, failed: true });
        })
        .finally(() => {
          opening = false;
        });
    };
    open();
    return () => {
      disposed = true;
      unsubscribe?.();
      source?.dispose();
    };
  }, [module, connectionId]);
  const controller = sourceState?.id === connectionId ? sourceState.controller : undefined;
  const value = useMemo(
    () => (controller ? { controller, connectionId } : null),
    [controller, connectionId],
  );
  return (
    <Context value={value}>
      {sourceState?.id === connectionId && sourceState.failed
        ? (renderFallback?.('error') ?? <ContentState.Error title={t('remoteAgent.loadFailed')} />)
        : !value
          ? (renderFallback?.('loading') ?? (
              <ContentState.Loading title={t('remoteAgent.connecting')} />
            ))
          : children}
    </Context>
  );
}
export function useRemoteAgent() {
  const value = use(Context);
  if (!value) throw new Error('RemoteAgentProvider is required');
  return value;
}
export function useRemoteConnection() {
  const { controller } = useRemoteAgent();
  return useSyncExternalStore(
    controller.subscribeConnection,
    controller.getConnection,
    controller.getConnection,
  );
}
export function useRemoteActions() {
  const { controller } = useRemoteAgent();
  return useSyncExternalStore(
    controller.subscribeActions,
    controller.getActions,
    controller.getActions,
  );
}
