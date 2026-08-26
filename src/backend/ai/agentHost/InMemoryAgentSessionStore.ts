import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type {
  AgentErrorView,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
} from '@/shared/contracts/agent';

import type {
  AgentSessionStore,
  FinalizeAssistantMessageInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';
import { interruptNonTerminalToolParts } from './mapping';

const UNSETTLED_MESSAGE_STATUSES = new Set<AgentMessageView['status']>(['pending', 'streaming']);

function nowIso(): string {
  return new Date().toISOString();
}

/** Values cross the store boundary by copy, matching row-mapping semantics. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** One stored message: the view plus the turn-level error column. */
type StoredMessage = {
  view: AgentMessageView;
  error: AgentErrorView | null;
  contextCheckpoint: unknown | null;
};

/**
 * Process-local reference adapter for {@link AgentSessionStore}.
 *
 * Its state belongs to one `ApplicationHost` generation and is not durable
 * across app restarts. It remains useful as the Host's architecture-test
 * adapter after durable Mobile Agent persistence lands. Production composition
 * selects it only while that persistence (agent-persistence.md) is pending.
 *
 * @experimental Do not infer restart recovery from this adapter.
 */
@Injectable('AgentSessionStore')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class InMemoryAgentSessionStore extends BaseService implements AgentSessionStore {
  private readonly sessions = new Map<string, AgentSessionView>();
  /** Insertion-ordered per Session, which is the transcript order. */
  private readonly messages = new Map<string, StoredMessage[]>();

  protected override onDestroy(): void {
    this.sessions.clear();
    this.messages.clear();
  }

  async createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
    const timestamp = nowIso();
    const session: AgentSessionView = {
      id: uuidv7(),
      agentId: input.agentId,
      executionTarget: { kind: 'local' },
      title: input.title ?? '',
      titleIsManual: input.title !== undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return cloneJson(session);
  }

  async getSession(sessionId: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    return session ? cloneJson(session) : null;
  }

  async renameSession(sessionId: string, title: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      title,
      titleIsManual: true,
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, renamed);
    return cloneJson(renamed);
  }

  async autoRenameSession(
    sessionId: string,
    expectedTitle: string,
    title: string,
  ): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.titleIsManual || session.title !== expectedTitle) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      title,
      titleIsManual: false,
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, renamed);
    return cloneJson(renamed);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.delete(sessionId)) {
      return false;
    }
    this.messages.delete(sessionId);
    return true;
  }

  async reserveSubmission(input: {
    sessionId: string;
    userParts: AgentMessagePart[];
  }): Promise<ReserveSubmissionResult> {
    const transcript = this.messages.get(input.sessionId);
    if (!transcript) {
      throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
    }
    // Synchronous section: both message writes commit together or not at all.
    const timestamp = nowIso();
    const turnId = uuidv7();
    const userMessage: AgentMessageView = {
      id: uuidv7(),
      sessionId: input.sessionId,
      turnId,
      role: 'user',
      status: 'success',
      parts: cloneJson(input.userParts),
      usage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const assistantMessage: AgentMessageView = {
      id: uuidv7(),
      sessionId: input.sessionId,
      turnId,
      role: 'assistant',
      status: 'pending',
      parts: [],
      usage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    transcript.push(
      { view: userMessage, error: null, contextCheckpoint: null },
      { view: assistantMessage, error: null, contextCheckpoint: null },
    );
    return cloneJson({ turnId, userMessage, assistantMessage });
  }

  async listMessages(sessionId: string): Promise<AgentMessageView[]> {
    return cloneJson((this.messages.get(sessionId) ?? []).map((stored) => stored.view));
  }

  async getLatestContextCheckpoint(sessionId: string) {
    const transcript = this.messages.get(sessionId) ?? [];
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const stored = transcript[index];
      if (stored?.view.role === 'assistant' && stored.contextCheckpoint !== null) {
        return cloneJson({
          assistantMessageId: stored.view.id,
          checkpoint: stored.contextCheckpoint,
        });
      }
    }
    return null;
  }

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    for (const transcript of this.messages.values()) {
      const stored = transcript.find((entry) => entry.view.id === input.assistantMessageId);
      if (!stored) {
        continue;
      }
      // Synchronous section: message terminal state settles atomically
      // (invariant 5).
      stored.view = {
        ...stored.view,
        status: input.status,
        parts: cloneJson(input.parts),
        usage: input.usage === null ? null : cloneJson(input.usage),
        updatedAt: nowIso(),
      };
      stored.error = input.error === null ? null : cloneJson(input.error);
      stored.contextCheckpoint =
        input.status === 'success' && input.contextCheckpoint !== null
          ? cloneJson(input.contextCheckpoint)
          : null;
      return cloneJson(stored.view);
    }
    throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<number> {
    let count = 0;
    for (const transcript of this.messages.values()) {
      for (const stored of transcript) {
        if (!UNSETTLED_MESSAGE_STATUSES.has(stored.view.status)) {
          continue;
        }
        stored.view = {
          ...stored.view,
          status: 'interrupted',
          parts: interruptNonTerminalToolParts(stored.view.parts, error.message),
          updatedAt: nowIso(),
        };
        if (stored.view.role === 'assistant') {
          stored.error = cloneJson(error);
          count += 1;
        }
      }
    }
    return count;
  }
}
