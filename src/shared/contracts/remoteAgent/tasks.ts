import type { RemotePage, RemoteSessionView } from './views';

export type RemoteTaskTrigger =
  | { kind: 'cron'; expr: string; timezone?: string }
  | { kind: 'interval'; ms: number }
  | { kind: 'once'; at: number };
export type RemoteTaskView = {
  id: string;
  agentId: string;
  name: string;
  trigger: RemoteTaskTrigger;
};

/** Read-only task capability sharing its Agent source's authorization and lifetime. */
export interface RemoteTaskQueries {
  list(cursor: string | undefined, signal: AbortSignal): Promise<RemotePage<RemoteTaskView>>;
  listSessions(
    taskId: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<RemotePage<RemoteSessionView>>;
  /** Confirms ownership through every required task-scoped catalog page. */
  readSession(taskId: string, sessionId: string, signal: AbortSignal): Promise<RemoteSessionView>;
}
