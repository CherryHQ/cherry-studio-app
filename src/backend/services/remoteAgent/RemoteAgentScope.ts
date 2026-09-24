import {
  agentMethods,
  questionInputSchema,
  interactionResponseSchema,
  type AgentMethod,
  type AgentMessage,
  type ContentRef,
  type AgentPart,
  type AgentProjection,
} from '@cherrystudio/remote-protocol/agent';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnections, DesktopDomainLease } from '@/backend/services/desktopConnections';
import type { DesktopSession } from '@/backend/services/desktopConnections/DesktopSession';
import { RemoteFailureError } from '@/backend/services/desktopConnections/remoteErrors';
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
  type RemoteResourceDescriptor,
} from './remoteAgentViews';
import { decodeContent, integrity, readContent, type AgentRequest } from './remoteContent';
import { RemoteReadCoordinator } from './RemoteReadCoordinator';
import type { RemoteSessionReadCache } from './RemoteSessionReadCache';
import { SessionSync } from './SessionSync';

type Observation = {
  listeners: Set<(snapshot: RemoteSessionSnapshot) => void>;
  sync?: SessionSync;
  snapshot?: RemoteSessionSnapshot;
  projection?: AgentProjection;
  retryTimer?: ReturnType<typeof setTimeout>;
  retries?: number;
};
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
  private readonly work = new Set<Promise<unknown>>();
  private readonly actions: RemoteAgentActions;
  private readonly unsubscribe: () => void;
  private stopped = false;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly lease: DesktopDomainLease,
    private readonly connections: DesktopConnections,
    journal: RemoteAgentCommandJournal,
    private readonly readCache: RemoteSessionReadCache,
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
    this.unsubscribe = lease.subscribe(() => this.onConnectionChanged());
    if (this.state.status === 'ready') this.actions.recover();
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
      if (observation.snapshot) {
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
    }
    clearTimeout(this.recoveryTimer);
    if (this.state.status === 'retired') this.actions.stop();
    for (const listener of this.stateListeners) listener();
    if (this.state.status === 'ready') {
      for (const [id, observation] of this.observations) this.startObservation(id, observation);
      this.actions.recover();
    }
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
    const descriptor = { scope: this.scope, sessionId, value };
    const id = `${this.scope}:resource:${integrity.sha256(new TextEncoder().encode(JSON.stringify(descriptor)))}`;
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
      if (!retained.listeners.size) {
        this.stopObservation(retained);
        if (this.observations.get(sessionId) === retained) this.observations.delete(sessionId);
      }
    };
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
            const entry = this.cacheEntry(sessionId);
            this.readCache.setEpoch(entry, projection.cursor.streamEpoch);
            this.readCache.put(entry, entry.generation, 'session', projection.session);
            observation.projection = projection;
            observation.snapshot = projectSnapshot(
              this.scope,
              projection,
              current,
              this.issueResource,
            );
            for (const listener of observation.listeners) listener(observation.snapshot);
          },
          () => {
            if (observation.sync !== sync) return;
            this.stopObservation(observation);
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
          ['confirming', 'accepted'].includes(command.status) &&
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
    return this.track(this.actions.start(input));
  }
  send(target: string, text: string) {
    const params = this.target(target, 'send');
    agentMethods['agent.messages.send'].params.parse({ ...params, commandId: 'validation', text });
    return this.track(
      this.actions.create('send', 'agent.messages.send', { ...params, text }, text),
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
  recover(id: string) {
    this.assertActive();
    return this.track(this.actions.retry(id));
  }
  dismiss(id: string) {
    this.assertActive();
    this.actions.dismiss(id);
  }
  private scheduleRecovery() {
    clearTimeout(this.recoveryTimer);
    if (
      !this.stopped &&
      this.state.status === 'ready' &&
      (this.actions.get().some((action) => ['confirming', 'accepted'].includes(action.status)) ||
        this.actions.getStarts().some((start) => start.status === 'pending'))
    )
      this.recoveryTimer = setTimeout(() => this.actions.recover(), 5000);
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.recoveryTimer);
    this.unsubscribe();
    this.actions.stop();
    for (const observation of this.observations.values()) this.stopObservation(observation);
    this.observations.clear();
    this.resources.clear();
    this.lease.release();
  }
  async drain() {
    while (this.work.size) await Promise.allSettled([...this.work]);
    await this.actions.drain();
  }
}
