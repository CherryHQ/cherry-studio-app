import { v4 as uuid } from 'uuid';

import { Emitter } from '@/backend/core/lifecycle/event';
import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import {
  TeamAgentError,
  teamAgentDraftKey,
  teamDraftKey,
  type TeamAgentModule,
  type TeamConversation,
  type TeamConversationState,
  type TeamDirectoryState,
  type TeamSessionRef,
  type TeamChatView,
} from '@/shared/contracts/teamAgent';

import type { TeamAgentAdapter, TeamAgentConnection } from './teamAgentAdapter';

const EMPTY: TeamDirectoryState = { context: null, phase: 'disabled', agents: [] };
const sessionKey = (target: TeamSessionRef) => JSON.stringify([target.agentId, target.sessionId]);
const failure = (error: unknown) =>
  error instanceof TeamAgentError ? error.code : ('offline' as const);
type Entry = {
  target: TeamSessionRef;
  connection: TeamAgentConnection;
  state: TeamConversationState;
  changes: Emitter<void>;
  users: number;
  active: number;
  revision: number;
  lifetime: AbortController;
  stream?: AbortController;
  reading?: Promise<void>;
};

/** Observes remote execution; it never executes a model/tool or writes local conversation data. */
export class TeamAgentRuntime implements TeamAgentModule {
  private state: TeamDirectoryState = EMPTY;
  private readonly changes = new Emitter<void>();
  private readonly sessionChanges = new Emitter<void>();
  private readonly entries = new Map<string, Entry>();
  private readonly drafts = new Map<string, string>();
  private readonly slots = createConcurrencySlots(4);
  private connection: TeamAgentConnection | null = null;
  private lifetime = new AbortController();
  private loading?: Promise<void>;
  private disposed = false;
  private readonly unsubscribers: (() => void)[];

  constructor(private readonly adapters: readonly TeamAgentAdapter[]) {
    this.unsubscribers = adapters.map((adapter) => adapter.subscribe(() => this.selectContext()));
    this.selectContext();
  }
  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };
  readonly subscribeSessions = (listener: () => void) => {
    const subscription = this.sessionChanges.event(listener);
    return () => subscription.dispose();
  };
  private selectContext() {
    if (this.disposed) return;
    const connection = this.adapters.map((adapter) => adapter.current()).find(Boolean) ?? null;
    if (connection?.context.key === this.connection?.context.key) return;
    this.lifetime.abort();
    for (const entry of this.entries.values()) {
      entry.lifetime.abort();
      entry.stream?.abort();
      entry.state = { phase: 'retired', view: null, submitting: false };
      entry.changes.fire();
    }
    this.entries.clear();
    this.drafts.clear();
    this.loading = undefined;
    this.lifetime = new AbortController();
    this.connection = connection;
    this.state = connection ? { context: connection.context, phase: 'loading', agents: [] } : EMPTY;
    this.changes.fire();
  }
  private current(connection = this.connection) {
    this.selectContext();
    if (!connection || connection !== this.connection || this.lifetime.signal.aborted)
      throw new TeamAgentError('retired');
    return connection;
  }
  readonly refresh = (): Promise<void> => {
    this.selectContext();
    const connection = this.connection;
    if (!connection) return Promise.resolve();
    if (!this.loading) {
      const signal = this.lifetime.signal;
      const attempt = connection
        .listAgents(signal)
        .then(
          (agents) => {
            this.current(connection);
            const visible = new Set(agents.map((agent) => agent.id));
            const withdrawn = new Set(
              this.state.agents.map((agent) => agent.id).filter((id) => !visible.has(id)),
            );
            if (withdrawn.size) this.clearAgentDrafts(connection.context.key, withdrawn);
            for (const [key, entry] of this.entries) {
              if (visible.has(entry.target.agentId)) continue;
              entry.stream?.abort();
              entry.lifetime.abort();
              entry.state = {
                phase: 'error',
                failure: 'not-visible',
                view: null,
                submitting: false,
              };
              entry.changes.fire();
              this.entries.delete(key);
            }
            this.state = { context: connection.context, phase: 'ready', agents };
            this.changes.fire();
          },
          (error: unknown) => {
            if (!signal.aborted) {
              const code = failure(error);
              if (code === 'not-visible') {
                for (const entry of this.entries.values()) {
                  entry.stream?.abort();
                  entry.lifetime.abort();
                  entry.state = { phase: 'error', failure: code, view: null, submitting: false };
                  entry.changes.fire();
                }
                this.entries.clear();
                this.drafts.clear();
              }
              this.state = {
                ...this.state,
                phase: 'error',
                failure: code,
                ...(code === 'not-visible' && this.state.agents.length ? { agents: [] } : {}),
              };
              this.changes.fire();
            }
            throw error;
          },
        )
        .finally(() => {
          if (this.loading === attempt) this.loading = undefined;
        });
      this.loading = attempt;
    }
    return this.loading;
  };
  readonly listSessions = async (agentId: string, signal: AbortSignal) => {
    const connection = this.current();
    const linked = AbortSignal.any([signal, this.lifetime.signal]);
    const release = await this.slots.acquire(linked);
    try {
      const sessions = await connection.listSessions(agentId, linked);
      this.current(connection);
      linked.throwIfAborted();
      return sessions;
    } finally {
      release();
    }
  };
  readonly createSession = async (agentId: string) => {
    const connection = this.current();
    if (!this.state.agents.find((agent) => agent.id === agentId)?.canCreateSession)
      throw new TeamAgentError('unavailable');
    const session = await connection.createSession(agentId, this.lifetime.signal);
    this.current(connection);
    this.sessionChanges.fire();
    return session;
  };
  readonly deleteSession = async (target: TeamSessionRef) => {
    const connection = this.current();
    const sessions = await this.listSessions(target.agentId, this.lifetime.signal);
    if (!sessions.find((session) => session.sessionId === target.sessionId)?.canDelete)
      throw new TeamAgentError('unsupported');
    await connection.deleteSession(target, this.lifetime.signal);
    this.current(connection);
    this.drafts.delete(teamDraftKey(connection.context.key, target));
    const key = sessionKey(target);
    const entry = this.entries.get(key);
    if (entry) {
      entry.lifetime.abort();
      entry.stream?.abort();
      entry.state = { phase: 'retired', view: null, submitting: false };
      entry.changes.fire();
      this.entries.delete(key);
    }
    this.sessionChanges.fire();
  };
  readonly readDetail = async (agentId: string, signal: AbortSignal) => {
    const connection = this.current();
    const detail = await connection.readDetail(
      agentId,
      AbortSignal.any([signal, this.lifetime.signal]),
    );
    this.current(connection);
    return detail;
  };
  readonly readPortrait = async (agentId: string, signal: AbortSignal) => {
    const connection = this.current();
    const portrait = await connection.readPortrait(
      agentId,
      AbortSignal.any([signal, this.lifetime.signal]),
    );
    this.current(connection);
    return portrait;
  };
  readonly readDraft = (key: string) => (this.ownsDraft(key) ? (this.drafts.get(key) ?? '') : '');
  readonly writeDraft = (key: string, text: string) => {
    if (!this.ownsDraft(key)) return;
    if (text) this.drafts.set(key, text);
    else this.drafts.delete(key);
  };
  private ownsDraft(key: string) {
    try {
      const value: unknown = JSON.parse(key);
      return !!this.state.context && Array.isArray(value) && value[0] === this.state.context.key;
    } catch {
      return false;
    }
  }
  private clearAgentDrafts(contextKey: string, agentIds: ReadonlySet<string>) {
    for (const id of agentIds) this.drafts.delete(teamAgentDraftKey(contextKey, id));
    for (const key of this.drafts.keys()) {
      const value: unknown = JSON.parse(key);
      if (!Array.isArray(value) || value.length !== 2 || typeof value[1] !== 'string') continue;
      try {
        const session: unknown = JSON.parse(value[1]);
        if (Array.isArray(session) && session.length === 2 && agentIds.has(session[0]))
          this.drafts.delete(key);
      } catch {
        // Other context-owned draft keys do not encode a session.
      }
    }
  }
  private assertEntry(entry: Entry) {
    this.current(entry.connection);
    entry.lifetime.signal.throwIfAborted();
  }
  private publish(entry: Entry, patch: Partial<TeamConversationState>) {
    this.assertEntry(entry);
    entry.state = { ...entry.state, ...patch };
    entry.changes.fire();
  }
  private installView(entry: Entry, view: TeamChatView) {
    const previous = new Map(entry.state.view?.messages.map((message) => [message.id, message]));
    const messages = view.messages.map((message) => {
      const old = previous.get(message.id);
      return old && JSON.stringify(old) === JSON.stringify(message) ? old : message;
    });
    const unknown = entry.state.unknown;
    const accepted =
      unknown &&
      view.run?.id === unknown.requestId &&
      !['missing', 'unknown', 'busy'].includes(view.run.state)
        ? unknown
        : undefined;
    if (accepted) this.clearAcceptedDraft(entry, accepted.input);
    this.publish(entry, {
      phase: 'current',
      failure: undefined,
      view: { ...view, messages },
      ...(accepted ? { unknown: undefined, accepted } : {}),
    });
    entry.revision++;
  }
  private clearAcceptedDraft(entry: Entry, input: string) {
    const key = teamDraftKey(entry.connection.context.key, entry.target);
    if (this.drafts.get(key)?.trim() === input.trim()) this.drafts.delete(key);
  }
  private releaseEntry(entry: Entry) {
    if (entry.users || entry.state.submitting || entry.state.unknown) return;
    if (this.entries.get(sessionKey(entry.target)) === entry)
      this.entries.delete(sessionKey(entry.target));
    entry.stream?.abort();
    entry.lifetime.abort();
    entry.state = { phase: 'retired', view: null, submitting: false };
    entry.changes.fire();
  }
  private read(entry: Entry): Promise<void> {
    this.assertEntry(entry);
    if (!entry.reading) {
      const revision = entry.revision;
      const attempt = entry.connection
        .readView(entry.target, entry.lifetime.signal)
        .then(
          (view) => {
            this.assertEntry(entry);
            if (entry.revision === revision) this.installView(entry, view);
          },
          (error: unknown) => {
            const code = failure(error);
            if (
              !entry.lifetime.signal.aborted &&
              (code === 'not-visible' || entry.revision === revision)
            )
              this.publish(entry, {
                phase: 'error',
                failure: code,
                ...(code === 'not-visible' ? { view: null } : {}),
              });
            throw error;
          },
        )
        .finally(() => {
          if (entry.reading === attempt) entry.reading = undefined;
          this.watch(entry);
        });
      entry.reading = attempt;
    }
    return entry.reading;
  }
  private watch(entry: Entry) {
    if (
      !entry.active ||
      entry.stream ||
      entry.lifetime.signal.aborted ||
      entry.state.view?.run?.state !== 'running'
    )
      return;
    const stream = new AbortController();
    entry.stream = stream;
    const signal = AbortSignal.any([stream.signal, entry.lifetime.signal]);
    void (async () => {
      let delay = 1000;
      while (!signal.aborted && entry.active && entry.state.view?.run?.state === 'running') {
        try {
          await entry.connection.watch(entry.target, signal, (view) => {
            if (!signal.aborted) this.installView(entry, view);
            delay = 1000;
          });
        } catch (error) {
          if (signal.aborted) break;
          this.publish(entry, {
            phase: 'error',
            failure: failure(error),
            ...(failure(error) === 'not-visible' ? { view: null } : {}),
          });
          if (
            error instanceof TeamAgentError &&
            ['not-visible', 'unavailable', 'unsupported', 'signed-out', 'retired'].includes(
              error.code,
            )
          )
            break;
        }
        if (signal.aborted || entry.state.view?.run?.state !== 'running') break;
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = setTimeout(finish, delay);
          signal.addEventListener('abort', finish, { once: true });
        });
        if (signal.aborted) break;
        delay = Math.min(delay * 2, 30_000);
        await this.read(entry).catch(() => {});
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (entry.stream === stream) entry.stream = undefined;
      });
  }
  readonly observe = (target: TeamSessionRef): TeamConversation => {
    const connection = this.current();
    const key = sessionKey(target);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        target,
        connection,
        state: { phase: 'loading', view: null, submitting: false },
        changes: new Emitter(),
        users: 0,
        active: 0,
        revision: 0,
        lifetime: new AbortController(),
      };
      this.entries.set(key, entry);
    }
    const own = entry;
    own.users++;
    let disposed = false;
    let active = false;
    const assertCurrent = () => {
      if (disposed) throw new TeamAgentError('retired');
      this.assertEntry(own);
    };
    return {
      getState: () => own.state,
      subscribe: (listener) => {
        const subscription = own.changes.event(listener);
        return () => subscription.dispose();
      },
      refresh: () => {
        assertCurrent();
        return this.read(own);
      },
      setActive: (next) => {
        if (disposed || own.lifetime.signal.aborted || next === active) return;
        active = next;
        own.active += next ? 1 : -1;
        if (!own.active) {
          own.stream?.abort();
          own.stream = undefined;
        } else void this.read(own).catch(() => {});
      },
      send: async (input, confirmDuplicate = false) => {
        assertCurrent();
        if (own.state.submitting || own.state.phase !== 'current' || !own.state.view?.canSend)
          throw new TeamAgentError('busy');
        if (own.state.unknown && !confirmDuplicate) return 'unknown';
        const submission = { requestId: uuid(), input };
        this.publish(own, { submitting: true });
        try {
          const result = await connection.submit(target, submission, own.lifetime.signal);
          this.assertEntry(own);
          if (result === 'accepted') {
            this.clearAcceptedDraft(own, input);
            this.publish(own, { unknown: undefined, accepted: submission });
          } else if (result === 'unknown') {
            this.publish(own, { unknown: submission });
          }
          if (result === 'accepted' || result === 'unknown') this.sessionChanges.fire();
          return result;
        } finally {
          if (!own.lifetime.signal.aborted) {
            this.publish(own, { submitting: false });
            this.releaseEntry(own);
            if (!own.lifetime.signal.aborted) void this.read(own).catch(() => {});
          }
        }
      },
      stop: async () => {
        assertCurrent();
        const view = own.state.view;
        if (own.state.phase !== 'current' || !view?.canStop || !view.run)
          throw new TeamAgentError('unavailable');
        await connection.stop(target, view.run.id, this.lifetime.signal);
        assertCurrent();
        await this.read(own);
      },
      respond: async (pendingId, requestId, reply) => {
        assertCurrent();
        if (
          own.state.phase !== 'current' ||
          !own.state.view?.canRespond ||
          !own.state.view.pending.some(
            (pending) => pending.id === pendingId && pending.requestId === requestId,
          )
        )
          throw new TeamAgentError('not-visible');
        await connection.respond(target, pendingId, requestId, reply, this.lifetime.signal);
        assertCurrent();
        await this.read(own);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        own.users--;
        if (active) own.active--;
        if (!own.active) {
          own.stream?.abort();
          own.stream = undefined;
        }
        this.releaseEntry(own);
      },
    };
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.lifetime.abort();
    for (const entry of this.entries.values()) {
      entry.stream?.abort();
      entry.lifetime.abort();
      entry.state = { phase: 'retired', view: null, submitting: false };
      entry.changes.fire();
    }
    this.entries.clear();
    this.drafts.clear();
    this.connection = null;
    this.state = EMPTY;
    this.changes.fire();
    this.changes.dispose();
    this.sessionChanges.dispose();
  }
}
