import type { AgentProtocol } from '@/shared/contracts/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { ApiClient } from '@/shared/data/api/types';

import type { ConversationListStatus, Readable } from '../contracts';
import { toConversationListStatus, type ConversationReadMarks } from './localConversationPreview';

// Decisions the user must resolve take precedence over progress and terminal outcomes.
const priority: Record<ConversationListStatus, number> = {
  'awaiting-approval': 0,
  'awaiting-input': 1,
  running: 2,
  failed: 3,
  unread: 4,
};
type Group = { agentId: string } | { sessionId: string };
type StatusPath = {
  path?: readonly AgentSessionEntity[];
  request?: AbortController;
  releaseReadMark?: () => void;
};

/** Shares status-only metadata reads across collapsed groups; never enumerates their children. */
export function createLocalConversationGroupStatus(input: {
  agent: AgentProtocol;
  api: ApiClient;
  readMarks?: ConversationReadMarks;
}) {
  const paths = new Map<string, StatusPath>();
  const listeners = new Set<() => void>();
  let unstatus: (() => void) | undefined;
  let unchanges: (() => void) | undefined;
  let disposed = false;
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const releasePath = (entry: StatusPath) => {
    entry.request?.abort();
    entry.releaseReadMark?.();
  };
  const refresh = (invalidatePaths = false) => {
    const ids = new Set(input.agent.getSessionStatusIds());
    for (const [id, entry] of paths) {
      if (ids.has(id)) continue;
      paths.delete(id);
      releasePath(entry);
    }
    for (const id of ids) {
      let entry = paths.get(id);
      if (!entry) {
        entry = {};
        paths.set(id, entry);
        entry.releaseReadMark = input.readMarks?.subscribe(id, () => refresh());
      }
      if (invalidatePaths) {
        entry.request?.abort();
        entry.request = undefined;
        entry.path = undefined;
      }
      const status = toConversationListStatus(
        input.agent.getSessionStatus(id),
        input.readMarks?.get(id),
      );
      if (!status || entry.path || entry.request) continue;
      const pending = entry;
      const request = new AbortController();
      pending.request = request;
      void input.api
        .get(`/agent-sessions/${id}/path`, { signal: request.signal })
        .then((path) => {
          if (request.signal.aborted) return;
          pending.path = path;
          publish();
        })
        .catch(() => {
          // A deleted Session or a cancelled read has no group hint. Later metadata/status
          // changes retry it; the row's own preview remains independent of this optional hint.
        })
        .finally(() => {
          if (pending.request === request) pending.request = undefined;
        });
    }
    publish();
  };
  const stop = () => {
    unstatus?.();
    unchanges?.();
    unstatus = undefined;
    unchanges = undefined;
    for (const entry of paths.values()) releasePath(entry);
    paths.clear();
  };
  return {
    read(group: Group): Readable<ConversationListStatus | undefined> {
      return {
        getSnapshot: () => {
          let result =
            'sessionId' in group
              ? toConversationListStatus(
                  input.agent.getSessionStatus(group.sessionId),
                  input.readMarks?.get(group.sessionId),
                )
              : undefined;
          for (const [id, entry] of paths) {
            const matches =
              'sessionId' in group
                ? entry.path?.some((session) => session.id === group.sessionId)
                : entry.path?.at(-1)?.agentId === group.agentId;
            if (!matches) continue;
            const status = toConversationListStatus(
              input.agent.getSessionStatus(id),
              input.readMarks?.get(id),
            );
            if (status && (!result || priority[status] < priority[result])) result = status;
          }
          return result;
        },
        subscribe: (listener) => {
          if (disposed) return () => {};
          listeners.add(listener);
          if (listeners.size === 1) {
            unstatus = input.agent.subscribeSessionStatuses(() => refresh());
            unchanges = input.api.subscribeChanges?.((changed) => {
              if (changed.some((path) => /^\/agent-sessions(?:\/[^/]+)?$/.test(path)))
                refresh(true);
            });
            refresh();
          }
          return () => {
            listeners.delete(listener);
            if (!listeners.size) stop();
          };
        },
      };
    },
    dispose() {
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}
