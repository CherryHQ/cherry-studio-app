import {
  agentMethods,
  questionInputSchema,
  interactionResponseSchema,
  type AgentMethod,
  type AgentMessage,
  type ContentRef,
  type AgentPart,
  type AgentProjection,
  type AgentSession,
} from '@cherrystudio/remote-protocol/agent';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import type { DesktopConnections, DesktopDomainLease } from '@/backend/services/desktopConnections';
import type { DesktopSession } from '@/backend/services/desktopConnections/DesktopSession';
import {
  RemoteFailureError,
  RemoteTransportError,
} from '@/backend/services/desktopConnections/remoteErrors';
import type { KeepAliveSource } from '@/backend/services/keepAlive/KeepAliveCoordinator';
import type {
  RemoteAgentSource,
  RemoteSessionSnapshot,
  RemoteSourceState,
  RemoteResourceValue,
} from '@/shared/contracts/remoteAgent';

import { RemoteAgentActions } from './RemoteAgentActions';
import { RemoteAgentError } from './RemoteAgentError';
import {
  projectMessage,
  projectSession,
  projectSnapshot,
  type MessageViewCache,
  type RemoteResourceDescriptor,
} from './remoteAgentViews';
import { decodeContent, integrity, readContent, type AgentRequest } from './remoteContent';
import { RemoteReadCoordinator } from './RemoteReadCoordinator';
import type { RemoteSessionReadCache } from './RemoteSessionReadCache';
import { SessionSync } from './SessionSync';

export type RemoteBackgroundExecution = {
  replies: BackgroundReplyLifecycle;
  keepAlive: KeepAliveSource;
  translate(key: string): string;
};

type Observation = {
  tracking?: boolean;
  awaitingCheckpoint?: boolean;
  pendingSubmission?: boolean;
  pendingCommandId?: string;
  reply?: BackgroundReplyTurn;
  executionId?: string;
  listeners: Set<(snapshot: RemoteSessionSnapshot) => void>;
  sync?: SessionSync;
  snapshot?: RemoteSessionSnapshot;
  projection?: AgentProjection;
  /** Session summary read from desktop storage by a conflict resync. */
  stored?: AgentSession;
  retryTimer?: ReturnType<typeof setTimeout>;
  retries?: number;
};
/**
 * The desktop can serve a checkpoint from a cached session that missed an out-of-run change, such
 * as an automatic title, while send admission checks storage. A newer idle summary read from
 * storage therefore supplies the idle revision and metadata; history revision stays with the stream.
 */
function withStoredSession(session: AgentSession, stored: AgentSession | undefined) {
  if (
    !stored?.idleRevision ||
    !session.idleRevision ||
    stored.sessionId !== session.sessionId ||
    Date.parse(stored.updatedAt) <= Date.parse(session.updatedAt)
  )
    return session;
  return {
    ...session,
    title: stored.title,
    updatedAt: stored.updatedAt,
    idleRevision: stored.idleRevision,
  };
}
const targetSchema = z.object({
  scope: z.string(),
  kind: z.string(),
  params: z.record(z.string(), z.string()),
});

/** Agent-domain observation and command owner. The manager alone owns channel lifecycle. */
export class RemoteAgentScope implements RemoteAgentSource {
  readonly scope: string;
  readonly draftScope: string;
  private readonly reads = new RemoteReadCoordinator();
  private state: RemoteSourceState;
  private readonly stateListeners = new Set<() => void>();
  private readonly observations = new Map<string, Observation>();
  private readonly resources = new Map<
    string,
    { sessionId: string; value: RemoteResourceDescriptor }
  >();
  private readonly messageViews: MessageViewCache = new WeakMap();
  private readonly partResources = new WeakMap<AgentPart, { sessionId: string; id: string }>();
  private readonly work = new Set<Promise<unknown>>();
  private readonly actions: RemoteAgentActions;
  private readonly unsubscribe: () => void;
  private stopped = false;
  private preparing = 0;
  private backgroundBlocked = false;
  private pendingCommandLease?: ReturnType<KeepAliveSource['acquire']>;
  private readonly pendingStarts = new Set<string>();
  private readonly pendingSends = new Set<string>();
  private readonly unoperations: () => void;
  private readonly executionListeners = new Set<() => void>();
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly lease: DesktopDomainLease,
    private readonly connections: DesktopConnections,
    journal: RemoteAgentCommandJournal,
    private readonly readCache: RemoteSessionReadCache,
    private readonly background?: RemoteBackgroundExecution,
  ) {
    this.scope = `${lease.scope}:${randomUUID()}`;
    this.draftScope = lease.scope;
    this.state = lease.getSnapshot();
    this.actions = new RemoteAgentActions(
      `${lease.connectionId}:${lease.scope}`,
      journal,
      async (method, params) => {
        if (!Object.hasOwn(agentMethods, method)) throw new RemoteAgentError('PROTOCOL_ERROR');
        const key = method as AgentMethod;
        return this.request(key, agentMethods[key].params.parse(params));
      },
      () => this.scheduleRecovery(),
    );
    this.unoperations = this.actions.subscribe(() => {
      for (const [id, observation] of this.observations) {
        if (!observation.pendingCommandId) continue;
        const command = this.actions
          .get()
          .find((command) => command.id === observation.pendingCommandId);
        if (command?.status === 'pending') continue;
        observation.pendingCommandId = undefined;
        observation.pendingSubmission = false;
        if (command?.status === 'applied') this.refreshExecutionCheckpoint(id);
        else this.settleUnadmittedSend(id, observation);
      }
      this.reconcileCommandProtection();
    });
    this.reconcileCommandProtection();
    this.unsubscribe = lease.subscribe(() => this.onConnectionChanged());
    if (this.state.status === 'ready') void this.actions.recover();
  }
  hasPendingExecution = () =>
    this.preparing > 0 ||
    this.hasPendingCommands() ||
    [...this.observations.values()].some((observation) => observation.tracking);
  subscribeExecution = (listener: () => void) => {
    this.executionListeners.add(listener);
    return () => {
      this.executionListeners.delete(listener);
    };
  };
  private hasPendingCommands(): boolean {
    return (
      this.actions.get().some((command) => command.status === 'pending') ||
      this.actions.getStarts().some((start) => start.status === 'pending')
    );
  }
  private reconcileCommandProtection(): void {
    for (const command of this.actions.get()) {
      if (command.kind !== 'send' || !command.sessionId) continue;
      if (command.status === 'pending') this.pendingSends.add(command.id);
      else if (
        this.pendingSends.delete(command.id) &&
        command.status === 'applied' &&
        !this.observations.get(command.sessionId)?.tracking
      )
        this.refreshExecutionCheckpoint(command.sessionId);
    }
    // Recovery may confirm the first send after its route has gone away. Hand
    // protection to the session before releasing the uncertain-command lease.
    for (const start of this.actions.getStarts()) {
      if (start.status === 'pending') this.pendingStarts.add(start.id);
      else if (
        this.pendingStarts.delete(start.id) &&
        start.status === 'applied' &&
        start.sessionId &&
        !this.observations.get(start.sessionId)?.tracking
      )
        this.refreshExecutionCheckpoint(start.sessionId);
    }
    if (this.hasPendingCommands() && !this.pendingCommandLease && !this.backgroundBlocked) {
      this.pendingCommandLease = this.background?.keepAlive.acquire('remote.chat.command', () => {
        this.backgroundBlocked = true;
        this.pendingCommandLease = undefined;
        this.publishExecution();
      });
    } else if (!this.hasPendingCommands() || this.backgroundBlocked) {
      this.pendingCommandLease?.release();
      this.pendingCommandLease = undefined;
    }
    this.publishExecution();
  }
  private releaseBackgroundProtection(): void {
    this.backgroundBlocked = true;
    this.pendingCommandLease?.release();
    this.pendingCommandLease = undefined;
    // The desktop still owns execution. Retire only the phone's surfaces, without a terminal card.
    for (const observation of this.observations.values()) {
      observation.reply?.retire();
      observation.reply = undefined;
    }
    this.publishExecution();
  }
  private publishExecution(): void {
    this.lease.setBackgroundRequired?.(this.hasPendingExecution() && !this.backgroundBlocked);
    for (const listener of this.executionListeners) listener();
  }

  getState = () => this.state;
  subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };
  getCommands = () => this.actions.get();
  getStarts = () => this.actions.getStarts();
  subscribeOperations = (listener: () => void) => this.actions.subscribe(listener);
  private track<T>(promise: Promise<T>): Promise<T> {
    this.work.add(promise);
    void promise.finally(() => this.work.delete(promise)).catch(() => undefined);
    return promise;
  }
  private assertActive() {
    if (this.stopped || this.lease.signal.aborted) throw new RemoteAgentError('CLOSED');
  }
  private onConnectionChanged() {
    this.state = this.lease.getSnapshot();
    for (const observation of this.observations.values()) {
      this.stopObservation(observation);
      this.withdrawTargets(observation);
    }
    clearTimeout(this.recoveryTimer);
    if (this.state.status === 'retired') this.actions.stop();
    for (const listener of this.stateListeners) listener();
    // The connection manager suspends background demand once the desktop stays
    // unreachable. Protection ends with it; foreground readiness resumes tracking.
    if (this.state.status === 'suspended' && !this.backgroundBlocked && this.hasPendingExecution())
      this.releaseBackgroundProtection();
    if (this.state.status === 'ready') {
      this.backgroundBlocked = false;
      this.reconcileCommandProtection();
      for (const [id, observation] of this.observations) this.startObservation(id, observation);
      void this.actions.recover();
    }
  }
  private withdrawTargets(observation: Observation) {
    if (!observation.snapshot) return;
    observation.snapshot = {
      ...observation.snapshot,
      current: false,
      sendTarget: undefined,
      executions: observation.snapshot.executions.map(
        ({ cancelTarget: _target, ...execution }) => execution,
      ),
      interactions: observation.snapshot.interactions.map(
        ({ respondTarget: _target, ...interaction }) => interaction,
      ),
    };
    for (const listener of observation.listeners) listener(observation.snapshot);
  }
  private publishObservation(
    sessionId: string,
    observation: Observation,
    projection: AgentProjection,
    current: boolean,
  ) {
    const session = withStoredSession(projection.session, observation.stored);
    const view = session === projection.session ? projection : { ...projection, session };
    const entry = this.cacheEntry(sessionId);
    this.readCache.setEpoch(entry, projection.cursor.streamEpoch);
    // Streamed batches keep the session object; rewriting it would re-project every history preview.
    if (this.readCache.get(entry, 'session') !== session)
      this.readCache.put(entry, entry.generation, 'session', session);
    observation.projection = projection;
    observation.snapshot = projectSnapshot(
      this.scope,
      view,
      current,
      this.issueResource,
      this.messageViews,
    );
    if (current && observation.reply)
      this.background?.replies.updateSessionTitle(
        sessionId,
        session.title,
        this.lease.connectionId,
      );
    this.updateExecution(sessionId, observation);
    for (const listener of observation.listeners) listener(observation.snapshot);
  }
  /**
   * A desktop CONFLICT proves this projection missed a session change: rebuild it from a checkpoint
   * and read the stored session summary, which admission checks even when the checkpoint is stale.
   */
  private async resync(sessionId: string) {
    this.assertActive();
    const observation = this.observations.get(sessionId);
    if (!observation || this.stopped || this.state.status !== 'ready') return;
    this.stopObservation(observation);
    this.withdrawTargets(observation);
    this.startObservation(sessionId, observation);
    const { session } = await this.track(this.request('agent.sessions.get', { sessionId }));
    if (this.stopped || this.observations.get(sessionId) !== observation) return;
    observation.stored = session;
    if (observation.projection && observation.snapshot?.current)
      this.publishObservation(sessionId, observation, observation.projection, true);
  }
  private request: AgentRequest = async (method, params, caller) => {
    this.assertActive();
    const signal = caller ? AbortSignal.any([caller, this.lease.signal]) : this.lease.signal;
    const session = await this.lease.ready(signal);
    return this.call(session, method, params, signal);
  };
  private async call<M extends AgentMethod>(
    session: DesktopSession,
    method: M,
    params: Parameters<AgentRequest>[1],
    signal: AbortSignal,
  ) {
    this.assertActive();
    signal.throwIfAborted();
    try {
      const value = await this.track(session.request(method, params as never, signal));
      this.assertActive();
      signal.throwIfAborted();
      return value;
    } catch (error) {
      // A lost reply is not a desktop verdict: the command stays uncertain and is recovered by receipt.
      if (error instanceof RemoteTransportError)
        throw new RemoteAgentError('CONNECTION_LOST', true, error.message);
      if (error instanceof RemoteFailureError) {
        if (
          error.reason === 'NOT_FOUND' &&
          (method === 'agent.sessions.get' || method === 'agent.messages.list') &&
          'sessionId' in params &&
          typeof params.sessionId === 'string'
        )
          this.readCache.remove(this.cacheEntry(params.sessionId));
        if (error.reason === 'UPGRADE_REQUIRED') {
          this.state = { ...this.state, reason: 'upgrade-required' };
          for (const listener of this.stateListeners) listener();
        }
        if (error.reason === 'FORBIDDEN' || error.reason === 'GRANT_REVOKED')
          await this.connections.revoke(this.lease.connectionId, 'agent', this.lease.grantId);
        throw new RemoteAgentError(
          error.reason,
          ['RATE_LIMITED', 'TOKEN_EXPIRED', 'RESOURCE_EXHAUSTED'].includes(error.reason),
          error.message,
        );
      }
      throw error;
    }
  }
  async listAgents(cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('agent.agents.list', { cursor }, signal);
    return {
      items: page.items.map((item) => ({
        id: item.agentId,
        name: item.name,
        emoji: item.emoji,
        ...(item.model !== undefined ? { model: item.model } : {}),
      })),
      next: page.nextCursor ?? undefined,
    };
  }
  async listWorkspaces(agentId: string, cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('agent.workspaces.list', { agentId, cursor }, signal);
    return {
      items: page.items.map((item) => ({ id: item.workspaceId, name: item.name })),
      systemWorkspace: page.systemWorkspace === true,
      next: page.nextCursor ?? undefined,
    };
  }
  async listSessions(agentId: string | undefined, cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('agent.sessions.list', { agentId, cursor }, signal);
    return { items: page.items.map(projectSession), next: page.nextCursor ?? undefined };
  }
  private cacheEntry(sessionId: string) {
    return this.readCache.entry(
      this.lease.connectionId,
      this.lease.scope,
      this.lease.grantId,
      sessionId,
    );
  }
  peekSession(sessionId: string) {
    this.assertActive();
    const entry = this.readCache.find(this.lease.scope, sessionId);
    const preview = entry && this.readCache.preview(entry);
    if (!preview) return;
    return {
      epoch: entry?.epoch,
      session: projectSession(preview.session),
      ...(preview.window
        ? {
            history: {
              items: preview.window.rows.map(({ message, parts }) =>
                projectMessage(sessionId, message, parts, this.issueResource),
              ),
              version: preview.window.version,
              readAt: preview.window.readAt,
              hasOlderMessages: preview.window.hasOlderMessages,
              complete: preview.window.complete,
            },
          }
        : {}),
    };
  }
  subscribeReads(sessionId: string, listener: () => void) {
    return this.readCache.subscribe(this.lease.scope, sessionId, listener);
  }
  async readSession(sessionId: string, signal: AbortSignal) {
    return this.reads.share(JSON.stringify(['session', sessionId]), signal, async (signal) => {
      const entry = this.cacheEntry(sessionId);
      const generation = entry.generation;
      const result = await this.request('agent.sessions.get', { sessionId }, signal);
      this.readCache.put(entry, generation, 'session', result.session);
      return projectSession(result.session);
    });
  }
  private historyRequest: AgentRequest = (method, params, signal = this.lease.signal) =>
    this.reads.run(signal, () => this.request(method, params, signal));
  private content(sessionId: string, ref: ContentRef, signal: AbortSignal): Promise<Uint8Array> {
    const entry = this.cacheEntry(sessionId);
    const generation = entry.generation;
    const key = JSON.stringify([
      'content',
      ref.contentId,
      ref.revision,
      ref.sha256,
      ref.byteLength,
    ]);
    const cached = this.readCache.get<Uint8Array>(entry, key);
    if (cached) return Promise.resolve(cached);
    return this.reads.share(
      JSON.stringify([sessionId, generation, key]),
      signal,
      async (signal) => {
        const bytes = await readContent(this.historyRequest, sessionId, ref, signal);
        this.readCache.put(entry, generation, key, bytes);
        return bytes;
      },
    );
  }
  private messageParts(sessionId: string, message: AgentMessage, signal: AbortSignal) {
    const entry = this.cacheEntry(sessionId);
    const generation = entry.generation;
    const key = this.readCache.partsKey(message);
    const cached = this.readCache.get<AgentPart[]>(entry, key);
    if (cached) return Promise.resolve(cached);
    return this.reads.share(
      JSON.stringify([sessionId, generation, key]),
      signal,
      async (signal) => {
        const parts: AgentPart[] = [];
        let next: string | undefined;
        const visited = new Set<string>();
        do {
          const page = await this.historyRequest(
            'agent.parts.list',
            {
              sessionId,
              messageId: message.messageId,
              messageRevision: message.revision,
              cursor: next,
            },
            signal,
          );
          parts.push(
            ...(await Promise.all(
              page.items.map(
                async (part): Promise<AgentPart> =>
                  (part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content
                    ? {
                        ...part,
                        content: {
                          text: decodeContent(
                            await this.content(sessionId, part.content.ref, signal),
                          ),
                        },
                      }
                    : part,
              ),
            )),
          );
          next = page.nextCursor ?? undefined;
          if (next && visited.has(next)) throw new RemoteAgentError('PROTOCOL_ERROR');
          if (next) visited.add(next);
        } while (next);
        this.readCache.put(entry, generation, key, parts);
        return parts;
      },
    );
  }
  history(sessionId: string, version: string, cursor: string | undefined, signal: AbortSignal) {
    return this.reads.share(
      JSON.stringify(['history', sessionId, version, cursor]),
      signal,
      (signal) => this.readHistory(sessionId, version, cursor, signal),
    );
  }
  private async readHistory(
    sessionId: string,
    version: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ) {
    const entry = this.cacheEntry(sessionId);
    if (!this.readCache.beginHistory(entry, version))
      throw new RemoteAgentError('REVISION_EXPIRED');
    const generation = entry.generation;
    const page = await this.historyRequest(
      'agent.messages.list',
      { sessionId, historyRevision: version, cursor },
      signal,
    );
    const window = {
      messages: page.items,
      version,
      readAt: Date.now(),
      hasOlderMessages: !!page.nextCursor,
    };
    // Cold history can reveal completed rows while slower bodies are still loading.
    // A warm window remains intact until its replacement is fully validated.
    if (!cursor && !this.readCache.get(entry, 'window'))
      this.readCache.put(entry, generation, 'window', window);
    const items = await Promise.all(
      page.items.map(async (message) =>
        projectMessage(
          sessionId,
          message,
          await this.messageParts(sessionId, message, signal),
          this.issueResource,
        ),
      ),
    );
    signal.throwIfAborted();
    if (entry.invalidated || entry.generation !== generation)
      throw new RemoteAgentError('REVISION_EXPIRED');
    if (!cursor) this.readCache.put(entry, generation, 'window', window);
    return { items, next: page.nextCursor ?? undefined };
  }
  private issueResource = (sessionId: string, value: RemoteResourceDescriptor): string => {
    // Hashing a part serializes its whole payload; an unchanged part object keeps its id.
    const part = value.kind === 'part' ? value.part : undefined;
    const issued = part && this.partResources.get(part);
    const id =
      issued?.sessionId === sessionId
        ? issued.id
        : `${this.scope}:resource:${integrity.sha256(new TextEncoder().encode(JSON.stringify({ scope: this.scope, sessionId, value })))}`;
    if (part && issued?.id !== id) this.partResources.set(part, { sessionId, id });
    if (!this.resources.has(id)) {
      this.resources.set(id, { sessionId, value });
      // Old live-input revisions may expire; no payload is copied into frontend query keys.
      if (this.resources.size > 2048) this.resources.delete(this.resources.keys().next().value!);
    }
    return id;
  };
  async readResource(ref: string, signal: AbortSignal): Promise<RemoteResourceValue> {
    this.assertActive();
    signal.throwIfAborted();
    const resource = this.resources.get(ref);
    if (!resource) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
    const { value, sessionId } = resource;
    if (value.kind === 'interaction') {
      const { interaction } = await this.request(
        'agent.interactions.get',
        { sessionId, interactionId: value.id },
        signal,
      );
      if (interaction.revision !== value.revision || interaction.inputDigest !== value.inputDigest)
        throw new RemoteAgentError('REVISION_EXPIRED');
      const text =
        'text' in interaction.input
          ? interaction.input.text
          : decodeContent(await this.content(sessionId, interaction.input.ref, signal));
      if (integrity.sha256(new TextEncoder().encode(text)) !== interaction.inputDigest)
        throw new RemoteAgentError('PROTOCOL_ERROR');
      if (interaction.kind === 'question') {
        const parsed = questionInputSchema.parse(JSON.parse(text));
        return {
          kind: 'question',
          questions: parsed.questions.map((question) => ({
            question: question.question,
            header: question.header,
            options: question.options,
            multiple: question.multiSelect ?? false,
          })),
        };
      }
      return { kind: 'text', text };
    }
    const part = value.part;
    if (part.kind === 'data' && part.name === 'file') {
      const text =
        'text' in part.content
          ? part.content.text
          : decodeContent(await this.content(sessionId, part.content.ref, signal));
      const metadata = z
        .object({ filename: z.string().nullable().optional(), mediaType: z.string().optional() })
        .parse(JSON.parse(text));
      return { kind: 'metadata', name: metadata.filename || 'file', mediaType: metadata.mediaType };
    }
    if (part.kind === 'file')
      return {
        kind: 'metadata',
        name: part.name,
        mediaType: part.ref.mediaType,
        byteLength: part.ref.byteLength,
      };
    return {
      kind: 'text',
      text:
        'text' in part.content
          ? part.content.text
          : decodeContent(await this.content(sessionId, part.content.ref, signal)),
    };
  }
  observe(sessionId: string, listener: (value: RemoteSessionSnapshot) => void) {
    this.assertActive();
    let observation = this.observations.get(sessionId);
    if (!observation) {
      observation = { listeners: new Set() };
      this.observations.set(sessionId, observation);
    }
    const retained = observation;
    const releaseCache = this.readCache.retain(this.cacheEntry(sessionId));
    retained.listeners.add(listener);
    if (retained.snapshot) listener(retained.snapshot);
    this.startObservation(sessionId, retained);
    return () => {
      releaseCache();
      retained.listeners.delete(listener);
      if (!retained.listeners.size && !retained.tracking) {
        this.stopObservation(retained);
        if (this.observations.get(sessionId) === retained) this.observations.delete(sessionId);
      }
    };
  }
  private trackExecution(sessionId: string): Observation {
    let observation = this.observations.get(sessionId);
    if (!observation) {
      observation = { listeners: new Set() };
      this.observations.set(sessionId, observation);
    }
    observation.tracking = true;
    observation.awaitingCheckpoint = true;
    if (!observation.reply && this.background && !this.backgroundBlocked) {
      observation.reply = this.background.replies.startTurn({
        connectionId: this.lease.connectionId,
        agentId: observation.snapshot?.session.agentId ?? '',
        agentName: '',
        sessionId,
        sessionTitle: observation.snapshot?.session.title ?? '',
        onInterrupt: () => {
          this.backgroundBlocked = true;
          // The desktop still owns execution. Retire only the phone's surface, without a terminal card.
          observation!.reply?.retire();
          observation!.reply = undefined;
          this.publishExecution();
        },
      });
    }
    this.publishExecution();
    return observation;
  }

  private updateExecution(sessionId: string, observation: Observation): void {
    const snapshot = observation.snapshot;
    if (!snapshot?.current || this.backgroundBlocked) return;
    const execution = snapshot.executions.find((execution) =>
      ['running', 'awaiting-approval', 'finalizing'].includes(execution.state),
    );
    if (execution) {
      if (observation.executionId && observation.executionId !== execution.id) {
        observation.reply?.finish('completed');
        observation.reply = undefined;
      }
      if (!observation.tracking || !observation.reply) this.trackExecution(sessionId);
      observation.awaitingCheckpoint = false;
      observation.executionId = execution.id;
      const message = snapshot.messages.find((message) => message.id === execution.messageId);
      const pending = snapshot.interactions.find((interaction) => interaction.state === 'pending');
      const tool = message?.parts.find(
        (part) => part.kind === 'tool' && ['streaming', 'input-ready'].includes(part.state),
      );
      const text = message?.parts
        .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
        .join('\n');
      const phase =
        pending || execution.state === 'awaiting-approval'
          ? 'awaiting-approval'
          : tool
            ? 'using-tool'
            : text
              ? 'responding'
              : 'thinking';
      const detail =
        this.background?.translate(
          execution.state === 'finalizing'
            ? 'remoteAgent.finalizing'
            : pending?.kind === 'question'
              ? 'chat.question.waiting'
              : `chat.backgroundReply.${phase === 'awaiting-approval' ? 'awaitingApproval' : phase === 'using-tool' ? 'tool.generic' : phase}`,
        ) ?? '';
      observation.reply?.updateContent({
        phase,
        detail,
        ...(text ? { preview: text.slice(-160) } : {}),
      });
      this.publishExecution();
    } else if (
      observation.tracking &&
      !observation.awaitingCheckpoint &&
      !observation.pendingSubmission
    ) {
      const terminal =
        snapshot.executions.find((execution) => execution.id === observation.executionId) ??
        snapshot.executions.at(-1);
      this.endTracking(
        sessionId,
        observation,
        terminal?.state === 'cancelled'
          ? 'cancelled'
          : terminal?.state === 'failed' ||
              terminal?.state === 'interrupted' ||
              terminal?.persistenceFailure
            ? 'failed'
            : 'completed',
      );
    }
  }

  /** A send the desktop never admitted must not settle as the previous turn's outcome. */
  private settleUnadmittedSend(sessionId: string, observation: Observation): void {
    observation.awaitingCheckpoint = false;
    if (observation.tracking && !observation.executionId && !observation.pendingSubmission)
      this.endTracking(sessionId, observation, 'failed');
    else this.updateExecution(sessionId, observation);
  }

  private endTracking(
    sessionId: string,
    observation: Observation,
    outcome: 'completed' | 'failed' | 'cancelled',
  ): void {
    observation.reply?.finish(outcome);
    observation.reply = undefined;
    observation.tracking = false;
    observation.awaitingCheckpoint = false;
    observation.executionId = undefined;
    this.publishExecution();
    if (!observation.listeners.size) {
      this.stopObservation(observation);
      if (this.observations.get(sessionId) === observation) this.observations.delete(sessionId);
    }
  }

  private async withPreparation<T>(work: () => Promise<T>): Promise<T> {
    this.preparing++;
    const lease = this.background?.keepAlive.acquire('remote.chat.preparation', () => {
      this.backgroundBlocked = true;
      this.publishExecution();
    });
    this.publishExecution();
    try {
      return await work();
    } finally {
      this.preparing--;
      lease?.release();
      this.publishExecution();
    }
  }

  private refreshExecutionCheckpoint(sessionId: string): void {
    const observation = this.trackExecution(sessionId);
    this.stopObservation(observation);
    this.startObservation(sessionId, observation);
  }

  private startObservation(sessionId: string, observation: Observation) {
    if (this.stopped || observation.sync || this.state.status !== 'ready') return;
    this.track(
      this.lease.ready(this.lease.signal).then((session) => {
        if (
          this.stopped ||
          observation.sync ||
          this.observations.get(sessionId) !== observation ||
          this.state.status !== 'ready'
        )
          return;
        const sync = new SessionSync(
          sessionId,
          {
            request: (method, params, signal) =>
              this.call(session, method, params, signal ?? this.lease.signal),
            onNotification: session.onNotification.bind(session),
            readContent: (ref, signal) => this.content(sessionId, ref, signal),
          },
          (projection, current) => {
            if (this.lease.signal.aborted || observation.sync !== sync) return;
            if (current) observation.retries = 0;
            if (current) observation.awaitingCheckpoint = false;
            this.publishObservation(sessionId, observation, projection, current);
          },
          (error) => {
            if (observation.sync !== sync) return;
            this.stopObservation(observation);
            // A deleted or forbidden session cannot report its execution again;
            // stop holding background demand for it.
            if (
              observation.tracking &&
              error instanceof RemoteAgentError &&
              !error.retryable &&
              error.code !== 'CLOSED'
            ) {
              this.endTracking(sessionId, observation, 'failed');
              if (!observation.listeners.size) return;
            }
            if (observation.snapshot) {
              observation.snapshot = {
                ...observation.snapshot,
                current: false,
                sendTarget: undefined,
              };
              for (const listener of observation.listeners) listener(observation.snapshot);
            }
            if (!this.stopped && this.state.status === 'ready') {
              const attempt = observation.retries ?? 0;
              observation.retries = attempt + 1;
              observation.retryTimer = setTimeout(
                () => this.startObservation(sessionId, observation),
                Math.min(20_000, 1000 * 2 ** Math.min(attempt, 5)),
              );
            }
          },
        );
        observation.sync = sync;
        return this.track(sync.start());
      }),
    ).catch(() => undefined);
  }
  private stopObservation(observation: Observation) {
    clearTimeout(observation.retryTimer);
    const sync = observation.sync;
    observation.sync = undefined;
    sync?.stop();
    if (sync) this.track(sync.drain());
  }
  private target(value: string, kind: 'send' | 'cancel' | 'respond') {
    this.assertActive();
    const target = targetSchema.parse(JSON.parse(value));
    const snapshot = this.observations.get(target.params.sessionId)?.snapshot;
    const valid =
      kind === 'send'
        ? snapshot?.sendTarget === value
        : kind === 'cancel'
          ? snapshot?.executions.some((execution) => execution.cancelTarget === value)
          : snapshot?.interactions.some((interaction) => interaction.respondTarget === value);
    const pending = this.actions
      .get()
      .some(
        (command) =>
          command.status === 'pending' &&
          command.kind === kind &&
          command.sessionId === target.params.sessionId &&
          (kind !== 'respond' || command.interactionId === target.params.interactionId),
      );
    if (
      pending ||
      target.scope !== this.scope ||
      target.kind !== kind ||
      !snapshot?.current ||
      !valid ||
      this.state.status !== 'ready'
    )
      throw new RemoteAgentError('CONFLICT');
    return target.params;
  }
  start(input: Parameters<RemoteAgentSource['start']>[0]) {
    this.assertActive();
    return this.track(this.withPreparation(() => this.actions.start(input)));
  }
  send(target: string, text: string) {
    const params = this.target(target, 'send');
    agentMethods['agent.messages.send'].params.parse({ ...params, commandId: 'validation', text });
    const observation = this.trackExecution(params.sessionId);
    observation.pendingSubmission = true;
    return this.track(
      this.withPreparation(async () => {
        try {
          const command = await this.actions.create(
            'send',
            'agent.messages.send',
            { ...params, text },
            text,
          );
          if (command.status === 'pending') observation.pendingCommandId = command.id;
          else observation.pendingSubmission = false;
          if (command.status === 'applied') this.refreshExecutionCheckpoint(params.sessionId);
          else if (command.status === 'rejected' || command.status === 'interrupted') {
            this.settleUnadmittedSend(params.sessionId, observation);
            if (command.error === 'CONFLICT')
              void this.resync(params.sessionId).catch(() => undefined);
          }
          return command;
        } catch (error) {
          observation.pendingSubmission = false;
          this.settleUnadmittedSend(params.sessionId, observation);
          throw error;
        }
      }),
    );
  }

  cancel(target: string) {
    return this.track(
      this.actions.create('cancel', 'agent.executions.cancel', this.target(target, 'cancel')),
    );
  }
  respond(target: string, input: Parameters<RemoteAgentSource['respond']>[1]) {
    const response = interactionResponseSchema.parse(input);
    return this.track(
      this.actions.create('respond', 'agent.interactions.respond', {
        ...this.target(target, 'respond'),
        ...(response.kind === 'approve' || (response.kind === 'deny' && !response.reason)
          ? { decision: response.kind }
          : { response }),
      }),
    );
  }
  discard(id: string) {
    this.assertActive();
    this.actions.discard(id);
  }
  release(id: string) {
    this.assertActive();
    this.actions.release(id);
  }
  private scheduleRecovery() {
    clearTimeout(this.recoveryTimer);
    if (
      !this.stopped &&
      this.state.status === 'ready' &&
      (this.actions.get().some((action) => action.status === 'pending') ||
        this.actions.getStarts().some((start) => start.status === 'pending'))
    )
      this.recoveryTimer = setTimeout(() => void this.actions.recover(), 5000);
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.recoveryTimer);
    this.unsubscribe();
    this.unoperations();
    this.pendingCommandLease?.release();
    this.pendingCommandLease = undefined;
    this.actions.stop();
    for (const observation of this.observations.values()) {
      observation.reply?.finish('cancelled');
      this.stopObservation(observation);
    }
    this.lease.setBackgroundRequired?.(false);
    this.observations.clear();
    this.resources.clear();
    this.lease.release();
  }
  async drain() {
    while (this.work.size) await Promise.allSettled([...this.work]);
    await this.actions.drain();
  }
}
