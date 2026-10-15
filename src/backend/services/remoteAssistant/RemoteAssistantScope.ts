import type { AgentMessage, AgentPart, ContentRef } from '@cherrystudio/remote-protocol/agent';
import {
  assistantMethods,
  type AssistantMethod,
  type AssistantParams,
  type AssistantResult,
  type AssistantProjection,
  type AssistantTopic,
} from '@cherrystudio/remote-protocol/assistant';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnections, DesktopDomainLease } from '@/backend/services/desktopConnections';
import type { DesktopSession } from '@/backend/services/desktopConnections/DesktopSession';
import {
  DesktopUnreachableError,
  RemoteFailureError,
  RemoteTransportError,
} from '@/backend/services/desktopConnections/remoteErrors';
import {
  RemoteConversationError,
  decodeContent,
  integrity,
  readContentBytes,
  projectMessage,
  type RemoteResourceDescriptor,
  type RemoteBackgroundExecution,
  type PartViewCache,
} from '@/backend/services/remoteConversation';
import type { InteractionResponse } from '@/shared/contracts/interaction';
import type {
  RemoteConversationSource,
  RemoteSessionSnapshot,
  RemoteSessionView,
  RemoteSourceState,
  RemoteResourceValue,
  RemoteStartInput,
  RemoteCommand,
  RemoteMessageView,
} from '@/shared/contracts/remoteAgent';

import type { BackgroundReplyTurn } from '../backgroundReply';
import type { KeepAliveLease } from '../keepAlive/KeepAliveCoordinator';
import type { AssistantRequest } from './assistantRequest';
import { RemoteAssistantActions } from './RemoteAssistantActions';
import { TopicSync } from './TopicSync';

type CatalogEntry = AssistantResult<'assistant.assistants.list'>['items'][number];
type Observation = {
  listeners: Set<(snapshot: RemoteSessionSnapshot) => void>;
  sync?: TopicSync;
  snapshot?: RemoteSessionSnapshot;
  projection?: AssistantProjection;
  generation: number;
  opening?: boolean;
  closing?: Promise<void>;
  tracking?: boolean;
  reply?: BackgroundReplyTurn;
  executionIds?: Set<string>;
  retry?: ReturnType<typeof setTimeout>;
  views?: {
    version: string;
    messages: WeakMap<AgentMessage, { parts: AgentPart[]; view: RemoteMessageView }>;
    parts: PartViewCache;
  };
};
const historyVersion = (topic: AssistantTopic) =>
  JSON.stringify([topic.historyRevision, topic.parentAnchorId]);
const topicView = (topic: AssistantTopic): RemoteSessionView => ({
  id: topic.topicId,
  agentId: topic.assistantId ?? undefined,
  title: topic.title,
  updatedAt: topic.updatedAt,
  historyVersion: historyVersion(topic),
  historyRevision: topic.historyRevision,
});
const viewParams = (topic: AssistantTopic) => ({
  topicId: topic.topicId,
  historyRevision: topic.historyRevision,
  parentAnchorId: topic.parentAnchorId,
});
const targetSchema = z.object({
  scope: z.string(),
  kind: z.enum(['send', 'cancel', 'respond']),
  params: z.record(z.string(), z.json()),
});

/** Owns Assistant grants, pinned topic views, observations and durable commands; never desktop execution. */
export class RemoteAssistantScope implements RemoteConversationSource {
  readonly scope: string;
  readonly draftScope: string;
  private readonly lifetime = new AbortController();
  private state: RemoteSourceState;
  private readonly stateListeners = new Set<() => void>();
  private readonly executionListeners = new Set<() => void>();
  private readonly observations = new Map<string, Observation>();
  private readonly topics = new Map<string, AssistantTopic>();
  private readonly catalog = new Map<string, CatalogEntry>();
  private readonly resources = new Map<
    string,
    { topic: AssistantTopic; value: RemoteResourceDescriptor }
  >();
  private readonly resourceIds = new WeakMap<object, Map<string, string>>();
  private readonly bodies = new Map<string, Uint8Array>();
  private bodyBytes = 0;
  private readonly work = new Set<Promise<unknown>>();
  private readonly actions: RemoteAssistantActions;
  private readonly unsubscribe: () => void;
  private readonly unoperations: () => void;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private preparing = 0;
  private preparationLease?: KeepAliveLease;
  private backgroundBlocked = false;
  private readonly commandStates = new Map<string, RemoteCommand['status']>();
  constructor(
    private readonly lease: DesktopDomainLease,
    private readonly connections: DesktopConnections,
    journal: RemoteAgentCommandJournal,
    private readonly background?: RemoteBackgroundExecution,
  ) {
    this.scope = `${lease.scope}:${randomUUID()}`;
    this.draftScope = lease.scope;
    this.state = { ...lease.getSnapshot(), attachments: false };
    this.actions = new RemoteAssistantActions(
      `${lease.connectionId}:assistant:${lease.scope}`,
      journal,
      this.request,
      () => this.scheduleRecovery(),
    );
    for (const command of this.actions.get()) this.commandStates.set(command.id, command.status);
    this.unoperations = this.actions.subscribe(() => {
      for (const command of this.actions.get()) {
        if (command.kind === 'create' || !command.sessionId) continue;
        const observation = this.observations.get(command.sessionId);
        const previous = this.commandStates.get(command.id);
        this.commandStates.set(command.id, command.status);
        if (command.status === 'pending' && !observation) this.trackTopic(command.sessionId);
        else if (previous === 'pending' && command.status !== 'pending') {
          void this.track(this.afterCommand(command, command.sessionId)).catch(() => undefined);
        }
      }
      this.publishExecution();
    });
    this.unsubscribe = lease.subscribe(() => this.connectionChanged());
    this.connectionChanged();
  }
  getState = () => this.state;
  subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };
  subscribeExecution = (listener: () => void) => {
    this.executionListeners.add(listener);
    return () => {
      this.executionListeners.delete(listener);
    };
  };
  getCommands = () => this.actions.get();
  getStarts = () => this.actions.getStarts();
  subscribeOperations = (listener: () => void) => this.actions.subscribe(listener);
  private assertActive() {
    if (this.stopped || this.lifetime.signal.aborted || this.state.status === 'retired')
      throw new RemoteConversationError('CLOSED');
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.work.add(promise);
    void promise.finally(() => this.work.delete(promise)).catch(() => undefined);
    return promise;
  }
  private request: AssistantRequest = async (method, params, caller) => {
    this.assertActive();
    const signal = AbortSignal.any([
      this.lease.signal,
      this.lifetime.signal,
      ...(caller ? [caller] : []),
    ]);
    try {
      const session = await this.lease.ready(signal);
      return await this.call(session, method, params, signal);
    } catch (error) {
      if (error instanceof DesktopUnreachableError || error instanceof RemoteTransportError)
        throw new RemoteConversationError('CONNECTION_LOST', true, error.message);
      throw error;
    }
  };
  private async call<M extends AssistantMethod>(
    session: DesktopSession,
    method: M,
    params: AssistantParams<M>,
    signal?: AbortSignal,
  ): Promise<AssistantResult<M>> {
    try {
      return await this.track(session.request(method, params as never, signal));
    } catch (error) {
      if (error instanceof RemoteFailureError) {
        if (error.reason === 'FORBIDDEN' || error.reason === 'GRANT_REVOKED')
          await this.connections.revoke(this.lease.connectionId, 'assistant', this.lease.grantId);
        if (error.reason === 'UPGRADE_REQUIRED') {
          this.state = { ...this.state, reason: 'upgrade-required' };
          for (const listener of this.stateListeners) listener();
        }
        throw new RemoteConversationError(
          error.reason,
          ['TOKEN_EXPIRED', 'RESOURCE_EXHAUSTED', 'RATE_LIMITED'].includes(error.reason),
          error.message,
        );
      }
      throw error;
    }
  }
  private connectionChanged() {
    if (this.stopped) return;
    this.state = { ...this.lease.getSnapshot(), attachments: false };
    if (this.state.status === 'ready') this.backgroundBlocked = false;
    for (const [id, observation] of this.observations) {
      this.stopObservation(observation);
      this.withdraw(observation);
      if (this.state.status === 'ready') this.startObservation(id, observation);
    }
    if (this.state.status === 'retired') {
      this.backgroundBlocked = true;
      for (const observation of this.observations.values()) {
        observation.tracking = false;
        observation.reply?.retire();
        observation.reply = undefined;
      }
      this.resources.clear();
      this.bodies.clear();
      this.bodyBytes = 0;
      this.catalog.clear();
      this.topics.clear();
      this.actions.stop();
    }
    for (const listener of this.stateListeners) listener();
    if (this.state.status === 'ready')
      void this.track(this.actions.recover()).catch(() => undefined);
    this.scheduleRecovery();
    this.publishExecution();
  }
  async listAgents(cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request('assistant.assistants.list', { cursor }, signal);
    for (const entry of page.items) this.catalog.set(entry.assistantId, entry);
    return {
      items: page.items.map((entry) => ({
        id: entry.assistantId,
        name: entry.name,
        emoji: entry.emoji,
        model: entry.available ? entry.model : null,
      })),
      next: page.nextCursor ?? undefined,
    };
  }
  private async readAssistant(id: string, signal: AbortSignal, refresh = false) {
    if (!refresh && this.catalog.has(id)) return this.catalog.get(id)!;
    let cursor: string | undefined;
    const visited = new Set<string>();
    do {
      const page = await this.request('assistant.assistants.list', { cursor }, signal);
      for (const entry of page.items) this.catalog.set(entry.assistantId, entry);
      const found = page.items.find((entry) => entry.assistantId === id);
      if (found) return found;
      cursor = page.nextCursor ?? undefined;
      if (cursor && visited.has(cursor)) throw new RemoteConversationError('PROTOCOL_ERROR');
      if (cursor) visited.add(cursor);
    } while (cursor);
    this.catalog.delete(id);
    return undefined;
  }
  async listSessions(agentId: string | undefined, cursor: string | undefined, signal: AbortSignal) {
    const page = await this.request(
      'assistant.topics.list',
      { assistantId: agentId, cursor },
      signal,
    );
    for (const topic of page.items) this.remember(topic);
    return { items: page.items.map(topicView), next: page.nextCursor ?? undefined };
  }
  private remember(topic: AssistantTopic) {
    this.topics.delete(topic.topicId);
    this.topics.set(topic.topicId, topic);
    if (this.topics.size > 100) this.topics.delete(this.topics.keys().next().value!);
  }
  peekSession(id: string) {
    this.assertActive();
    const topic = this.topics.get(id);
    if (topic) return { session: topicView(topic) };
  }
  subscribeReads(_id: string, _listener: () => void) {
    return () => undefined;
  }
  async readSession(id: string, signal: AbortSignal) {
    const { topic } = await this.request('assistant.topics.get', { topicId: id }, signal);
    this.remember(topic);
    return topicView(topic);
  }
  private content(topic: AssistantTopic, ref: ContentRef, signal: AbortSignal) {
    const key = JSON.stringify([viewParams(topic), ref]);
    const cached = this.bodies.get(key);
    if (cached) return Promise.resolve(cached);
    return readContentBytes(
      ref,
      (offset, caller) =>
        this.request(
          'assistant.content.read',
          {
            ...viewParams(topic),
            contentId: ref.contentId,
            revision: ref.revision,
            offset,
            maxBytes: 24_576,
          },
          caller,
        ),
      signal,
    ).then((bytes) => {
      if (bytes.length <= 1024 * 1024 && !this.stopped) {
        this.bodyBytes += bytes.length - (this.bodies.get(key)?.length ?? 0);
        this.bodies.set(key, bytes);
        while (this.bodyBytes > 8 * 1024 * 1024 || this.bodies.size > 128) {
          const first = this.bodies.entries().next().value!;
          this.bodyBytes -= first[1].length;
          this.bodies.delete(first[0]);
        }
      }
      return bytes;
    });
  }
  async history(id: string, version: string, cursor: string | undefined, signal: AbortSignal) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(version);
    } catch {
      throw new RemoteConversationError('REVISION_EXPIRED');
    }
    const parsed = z.tuple([z.string().regex(/^\d+$/), z.string().nullable()]).safeParse(decoded);
    if (!parsed.success) throw new RemoteConversationError('REVISION_EXPIRED');
    const [revision, anchor] = parsed.data;
    const topic = this.topics.get(id);
    if (!topic || historyVersion(topic) !== version)
      throw new RemoteConversationError('REVISION_EXPIRED');
    const view = { ...topic, historyRevision: revision, parentAnchorId: anchor };
    const page = await this.request(
      'assistant.messages.list',
      { ...viewParams(view), cursor },
      signal,
    );
    // Keep RPC work bounded: one message's parts at a time, independently pageable in the protocol.
    const items = [];
    for (const message of page.items) {
      const parts: AgentPart[] = [];
      let next: string | undefined;
      const visited = new Set<string>();
      do {
        const partPage = await this.request(
          'assistant.parts.list',
          {
            ...viewParams(view),
            messageId: message.messageId,
            messageRevision: message.revision,
            cursor: next,
          },
          signal,
        );
        for (const part of partPage.items) {
          parts.push(
            (part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content
              ? {
                  ...part,
                  content: {
                    text: decodeContent(await this.content(view, part.content.ref, signal)),
                  },
                }
              : part,
          );
        }
        next = partPage.nextCursor ?? undefined;
        if (next && visited.has(next)) throw new RemoteConversationError('PROTOCOL_ERROR');
        if (next) visited.add(next);
      } while (next);
      if (message.partCount !== undefined && message.partCount !== parts.length)
        throw new RemoteConversationError('PROTOCOL_ERROR');
      items.push(projectMessage(id, message, parts, (_, value) => this.issueResource(view, value)));
    }
    // Assistant wire pages are chronological; the shared conversation port reads newest first.
    return { items: items.toReversed(), next: page.nextCursor ?? undefined };
  }
  private issueResource(topic: AssistantTopic, value: RemoteResourceDescriptor) {
    const object = value.kind === 'part' ? value.part : value;
    const key = JSON.stringify(viewParams(topic));
    let ids = this.resourceIds.get(object);
    if (!ids) {
      ids = new Map();
      this.resourceIds.set(object, ids);
    }
    let id = ids.get(key);
    if (!id || !this.resources.has(id)) {
      id = `${this.scope}:${randomUUID()}`;
      ids.set(key, id);
      this.resources.set(id, { topic, value });
      if (this.resources.size > 2048) this.resources.delete(this.resources.keys().next().value!);
    }
    return id;
  }
  async readResource(id: string, signal: AbortSignal): Promise<RemoteResourceValue> {
    this.assertActive();
    signal.throwIfAborted();
    const resource = this.resources.get(id);
    if (!resource) throw new RemoteConversationError('RESOURCE_UNAVAILABLE');
    const { topic, value } = resource;
    if (value.kind === 'interaction') {
      const { interaction } = await this.request(
        'assistant.interactions.get',
        { topicId: topic.topicId, interactionId: value.id },
        signal,
      );
      if (interaction.revision !== value.revision || interaction.inputDigest !== value.inputDigest)
        throw new RemoteConversationError('REVISION_EXPIRED');
      const text =
        'text' in interaction.input
          ? interaction.input.text
          : decodeContent(await this.content(topic, interaction.input.ref, signal));
      if (integrity.sha256(new TextEncoder().encode(text)) !== interaction.inputDigest)
        throw new RemoteConversationError('PROTOCOL_ERROR');
      return { kind: 'text', text };
    }
    const part = value.part;
    if (part.kind === 'file')
      return {
        kind: 'metadata',
        name: part.name,
        mediaType: part.ref.mediaType,
        byteLength: part.ref.byteLength,
      };
    const text =
      'text' in part.content
        ? part.content.text
        : decodeContent(await this.content(topic, part.content.ref, signal));
    if (part.kind === 'data' && part.name === 'file') {
      try {
        const metadata = JSON.parse(text);
        return {
          kind: 'metadata',
          name: typeof metadata?.filename === 'string' ? metadata.filename : 'file',
          mediaType: typeof metadata?.mediaType === 'string' ? metadata.mediaType : undefined,
        };
      } catch {
        return { kind: 'metadata', name: 'file' };
      }
    }
    return { kind: 'text', text };
  }
  observe(id: string, listener: (snapshot: RemoteSessionSnapshot) => void) {
    this.assertActive();
    const observation = this.observation(id);
    observation.listeners.add(listener);
    if (observation.snapshot) listener(observation.snapshot);
    this.startObservation(id, observation);
    return () => {
      observation.listeners.delete(listener);
      this.releaseObservation(id, observation);
    };
  }
  private observation(id: string) {
    let value = this.observations.get(id);
    if (!value) {
      value = { listeners: new Set(), generation: 0 };
      this.observations.set(id, value);
    }
    return value;
  }
  private trackTopic(id: string) {
    const observation = this.observation(id);
    observation.tracking = true;
    this.startObservation(id, observation);
    this.publishExecution();
    return observation;
  }
  private releaseObservation(id: string, observation: Observation) {
    if (observation.listeners.size || observation.tracking || this.pendingTopic(id)) return;
    this.stopObservation(observation);
    observation.reply?.retire();
    // A quick route return must share the pending close before allocating another subscription.
    void Promise.resolve(observation.closing).then(() => {
      if (
        this.observations.get(id) === observation &&
        !observation.listeners.size &&
        !observation.tracking &&
        !this.pendingTopic(id)
      )
        this.observations.delete(id);
    });
  }
  private pendingTopic(id: string) {
    return (
      this.actions
        .get()
        .some((command) => command.sessionId === id && command.status === 'pending') ||
      this.actions.getStarts().some((start) => start.sessionId === id && start.status === 'pending')
    );
  }
  private startObservation(id: string, observation: Observation) {
    if (this.stopped || this.state.status !== 'ready' || observation.sync || observation.opening)
      return;
    clearTimeout(observation.retry);
    observation.opening = true;
    const generation = ++observation.generation;
    void this.track(
      (async () => {
        await observation.closing;
        const connection = await this.lease.ready(this.lifetime.signal);
        if (this.stopped || observation.generation !== generation) return;
        const sync = new TopicSync(
          id,
          {
            // Cleanup must reach the same connection even after this scope retires.
            request: (method, params, signal) => this.call(connection, method, params, signal),
            readContent: (ref, topic, signal) => this.content(topic, ref, signal),
            onNotification: (listener) => connection.onNotification(listener),
          },
          (projection, current) => {
            if (this.stopped || observation.generation !== generation) return;
            observation.projection = projection;
            this.remember(projection.topic);
            if (
              current &&
              projection.topic.assistantId &&
              !this.catalog.has(projection.topic.assistantId)
            ) {
              this.publish(observation, projection, false);
              void this.track(
                this.readAssistant(projection.topic.assistantId, this.lifetime.signal).then(() => {
                  if (
                    observation.generation === generation &&
                    observation.projection === projection
                  )
                    this.publish(observation, projection, true);
                }),
              ).catch(() => this.retryObservation(id, observation));
            } else this.publish(observation, projection, current);
          },
          () => {
            if (observation.generation === generation) this.retryObservation(id, observation);
          },
        );
        observation.sync = sync;
        observation.opening = false;
        await sync.start();
      })(),
    ).catch(() => {
      if (observation.generation === generation) this.retryObservation(id, observation);
    });
  }
  private retryObservation(id: string, observation: Observation) {
    this.stopObservation(observation);
    this.withdraw(observation);
    if (!this.stopped && this.state.status === 'ready')
      observation.retry = setTimeout(() => this.startObservation(id, observation), 2000);
  }
  private stopObservation(observation: Observation) {
    observation.generation++;
    observation.opening = false;
    clearTimeout(observation.retry);
    const sync = observation.sync;
    observation.sync = undefined;
    sync?.stop();
    if (sync) observation.closing = this.track(sync.drain());
  }
  private withdraw(observation: Observation) {
    if (!observation.snapshot) return;
    observation.snapshot = {
      ...observation.snapshot,
      current: false,
      sendTarget: undefined,
      executions: observation.snapshot.executions.map((execution) => ({
        ...execution,
        cancelTarget: undefined,
      })),
      interactions: observation.snapshot.interactions.map((interaction) => ({
        ...interaction,
        respondTarget: undefined,
      })),
    };
    for (const listener of observation.listeners) listener(observation.snapshot);
  }
  private targetId(
    kind: 'send' | 'cancel' | 'respond',
    params: Record<string, z.infer<ReturnType<typeof z.json>>>,
  ) {
    return JSON.stringify({ scope: this.scope, kind, params });
  }
  private publish(observation: Observation, projection: AssistantProjection, current: boolean) {
    const topic = projection.topic;
    const version = historyVersion(topic);
    if (observation.views?.version !== version)
      observation.views = { version, messages: new WeakMap(), parts: new WeakMap() };
    const views = observation.views;
    const assistant = topic.assistantId ? this.catalog.get(topic.assistantId) : undefined;
    const actionable = current && this.state.status === 'ready';
    const snapshot: RemoteSessionSnapshot = {
      historyEpoch: projection.cursor.streamEpoch,
      session: topicView(topic),
      current: actionable,
      ...(actionable &&
      assistant?.available &&
      assistant.model &&
      !topic.activeExecutionIds.length &&
      !this.pendingTopic(topic.topicId)
        ? {
            sendTarget: this.targetId('send', {
              topicId: topic.topicId,
              assistantId: assistant.assistantId,
              expectedAssistantRevision: assistant.configurationRevision,
              parentAnchorId: topic.parentAnchorId,
              expectedHistoryRevision: topic.historyRevision,
            }),
          }
        : {}),
      messages: Object.values(projection.messages).map((message) => {
        const parts = message.partIds.flatMap((id) => projection.parts[id] ?? []);
        const cached = views.messages.get(message);
        if (
          cached?.parts.length === parts.length &&
          cached.parts.every((part, index) => part === parts[index])
        )
          return cached.view;
        const view = projectMessage(
          topic.topicId,
          message,
          parts,
          (_, value) => this.issueResource(topic, value),
          views.parts,
        );
        views.messages.set(message, { parts, view });
        return view;
      }),
      executions: Object.values(projection.executions).map((execution) => ({
        id: execution.executionId,
        messageId: execution.messageId,
        state: execution.status,
        failure: execution.failure,
        persistenceFailure: execution.persistenceFailure,
        durable: execution.durable,
        history: execution.history,
        // Assistant cancellation targets the entire observed execution set, not one model.
        ...(actionable && topic.activeExecutionIds[0] === execution.executionId
          ? {
              cancelTarget: this.targetId('cancel', {
                topicId: topic.topicId,
                expectedExecutionIds: topic.activeExecutionIds,
              }),
            }
          : {}),
      })),
      interactions: Object.values(projection.interactions).map((interaction) => ({
        id: interaction.interactionId,
        executionId: interaction.executionId,
        title: interaction.summary,
        kind: interaction.kind,
        state: interaction.status,
        desktopRequired: interaction.desktopRequired,
        input: this.issueResource(topic, {
          kind: 'interaction',
          id: interaction.interactionId,
          revision: interaction.revision,
          inputDigest: interaction.inputDigest,
        }),
        ...(actionable &&
        interaction.status === 'pending' &&
        interaction.respondable &&
        !interaction.desktopRequired
          ? {
              respondTarget: this.targetId('respond', {
                topicId: topic.topicId,
                interactionId: interaction.interactionId,
                messageId: interaction.messageId,
                expectedRevision: interaction.revision,
                expectedExecutionId: interaction.executionId,
                expectedAssistantRevision: interaction.configurationRevision,
                inputDigest: interaction.inputDigest,
              }),
            }
          : {}),
      })),
    };
    observation.snapshot = snapshot;
    if (current) {
      observation.tracking =
        topic.activeExecutionIds.length > 0 || this.pendingTopic(topic.topicId);
    }
    if (current) this.updateBackground(observation, projection);
    for (const listener of observation.listeners) listener(snapshot);
    this.publishExecution();
    this.releaseObservation(topic.topicId, observation);
  }
  private target(value: string, kind: 'send' | 'cancel' | 'respond') {
    this.assertActive();
    const target = targetSchema.parse(JSON.parse(value));
    const id = target.params.topicId;
    const snapshot = typeof id === 'string' ? this.observations.get(id)?.snapshot : undefined;
    const valid =
      kind === 'send'
        ? snapshot?.sendTarget === value
        : kind === 'cancel'
          ? snapshot?.executions.some((item) => item.cancelTarget === value)
          : snapshot?.interactions.some((item) => item.respondTarget === value);
    const pending = this.actions
      .get()
      .some(
        (command) =>
          command.status === 'pending' &&
          command.kind === kind &&
          command.sessionId === id &&
          (kind !== 'respond' || command.interactionId === target.params.interactionId),
      );
    if (
      target.scope !== this.scope ||
      target.kind !== kind ||
      !snapshot?.current ||
      !valid ||
      pending ||
      this.state.status !== 'ready'
    )
      throw new RemoteConversationError('CONFLICT');
    return target.params;
  }
  async start(input: RemoteStartInput) {
    this.assertActive();
    this.preparing++;
    this.publishExecution();
    try {
      const assistant = await this.readAssistant(input.agentId, this.lifetime.signal);
      if (!assistant?.available || !assistant.model)
        throw new RemoteConversationError('TARGET_UNAVAILABLE');
      const result = await this.actions.start(input, assistant.configurationRevision);
      if (result.sessionId) this.refresh(result.sessionId);
      return result;
    } finally {
      this.preparing--;
      this.publishExecution();
    }
  }
  async send(
    target: string,
    text: string,
    attachments?: Parameters<RemoteConversationSource['send']>[2],
  ) {
    if (attachments?.length) throw new RemoteConversationError('INVALID_PARAMS');
    const params = this.target(target, 'send');
    assistantMethods['assistant.messages.send'].params.parse({
      ...params,
      commandId: 'validation',
      text,
    });
    const id = params.topicId as string;
    this.trackTopic(id);
    this.preparing++;
    this.publishExecution();
    try {
      return await this.actions.create(
        'send',
        'assistant.messages.send',
        { ...params, text },
        text,
      );
    } finally {
      this.preparing--;
      this.publishExecution();
    }
  }
  async cancel(target: string) {
    const params = this.target(target, 'cancel');
    return this.actions.create('cancel', 'assistant.executions.cancel', params);
  }
  async respond(target: string, response: InteractionResponse) {
    if (response.kind === 'answer') throw new RemoteConversationError('TARGET_UNAVAILABLE');
    const params = this.target(target, 'respond');
    return this.actions.create('respond', 'assistant.interactions.respond', {
      ...params,
      decision: response.kind,
    });
  }
  private async afterCommand(command: RemoteCommand, id: string) {
    if (command.status !== 'pending') {
      if (command.status === 'rejected') {
        const assistantId = this.topics.get(id)?.assistantId;
        if (assistantId)
          await this.readAssistant(assistantId, this.lifetime.signal, true).catch(() => undefined);
      }
      this.refresh(id);
    }
    return command;
  }
  private refresh(id: string) {
    const observation = this.trackTopic(id);
    this.stopObservation(observation);
    this.withdraw(observation);
    this.startObservation(id, observation);
  }
  hasPendingExecution() {
    if (this.stopped || this.state.status === 'retired') return false;
    return (
      this.preparing > 0 ||
      this.actions.get().some((command) => command.status === 'pending') ||
      this.actions.getStarts().some((start) => start.status === 'pending') ||
      [...this.observations.values()].some((observation) => observation.tracking)
    );
  }
  private updateBackground(observation: Observation, projection: AssistantProjection) {
    if (!this.background || this.backgroundBlocked) return;
    const active = Object.values(projection.executions).find((execution) =>
      projection.topic.activeExecutionIds.includes(execution.executionId),
    );
    if (active) {
      if (!observation.reply) observation.executionIds = new Set();
      for (const id of projection.topic.activeExecutionIds) observation.executionIds!.add(id);
      observation.reply ??= this.background.replies.startTurn({
        connectionId: this.lease.connectionId,
        domain: 'assistant',
        agentId: projection.topic.assistantId ?? '',
        agentName: this.catalog.get(projection.topic.assistantId ?? '')?.name ?? '',
        sessionId: projection.topic.topicId,
        sessionTitle: projection.topic.title,
        onInterrupt: () => {
          this.backgroundBlocked = true;
          observation.reply?.retire();
          observation.reply = undefined;
          this.publishExecution();
        },
      });
      const message = observation.snapshot?.messages.find((item) => item.id === active.messageId);
      const preview = message?.parts
        .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
        .join('\n');
      const approval = Object.values(projection.interactions).some(
        (item) => item.status === 'pending',
      );
      const tool = message?.parts.some(
        (part) => part.kind === 'tool' && ['streaming', 'input-ready'].includes(part.state),
      );
      const phase = approval
        ? 'awaiting-approval'
        : tool
          ? 'using-tool'
          : preview
            ? 'responding'
            : 'thinking';
      observation.reply.updateContent({
        phase,
        detail: this.background.translate(
          active.status === 'finalizing'
            ? 'remoteAgent.finalizing'
            : phase === 'awaiting-approval'
              ? 'chat.backgroundReply.awaitingApproval'
              : phase === 'using-tool'
                ? 'chat.backgroundReply.tool.generic'
                : phase === 'responding'
                  ? 'chat.backgroundReply.responding'
                  : 'chat.backgroundReply.thinking',
        ),
        ...(preview ? { preview: preview.slice(-160) } : {}),
      });
    } else if (observation.reply && !this.pendingTopic(projection.topic.topicId)) {
      const terminals = [...(observation.executionIds ?? [])].flatMap(
        (id) => projection.executions[id] ?? [],
      );
      observation.reply.finish(
        terminals.some(
          (terminal) =>
            terminal.status === 'failed' ||
            terminal.status === 'interrupted' ||
            terminal.persistenceFailure,
        )
          ? 'failed'
          : terminals.some((terminal) => terminal.status === 'cancelled')
            ? 'cancelled'
            : 'completed',
      );
      observation.reply = undefined;
      observation.executionIds = undefined;
    }
  }
  private publishExecution() {
    const pending =
      !this.stopped &&
      !this.backgroundBlocked &&
      (this.preparing > 0 ||
        this.actions.get().some((command) => command.status === 'pending') ||
        this.actions.getStarts().some((start) => start.status === 'pending'));
    if (pending && this.background && !this.preparationLease)
      this.preparationLease = this.background.keepAlive.acquire('remote-assistant.command', () => {
        this.backgroundBlocked = true;
        this.preparationLease?.release();
        this.preparationLease = undefined;
        this.publishExecution();
      });
    if (!pending) {
      this.preparationLease?.release();
      this.preparationLease = undefined;
    }
    this.lease.setBackgroundRequired?.(
      !this.stopped && !this.backgroundBlocked && this.hasPendingExecution(),
    );
    for (const listener of this.executionListeners) listener();
  }
  private scheduleRecovery() {
    clearTimeout(this.recoveryTimer);
    if (
      !this.stopped &&
      this.state.status === 'ready' &&
      (this.actions.get().some((command) => command.status === 'pending') ||
        this.actions.getStarts().some((start) => start.status === 'pending'))
    )
      this.recoveryTimer = setTimeout(() => {
        void this.track(this.actions.recover())
          .catch(() => undefined)
          .finally(() => this.scheduleRecovery());
      }, 5000);
  }
  discard(id: string) {
    this.assertActive();
    this.actions.discard(id);
  }
  release(id: string) {
    this.assertActive();
    this.actions.release(id);
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    this.lifetime.abort();
    clearTimeout(this.recoveryTimer);
    this.unsubscribe();
    this.unoperations();
    this.actions.stop();
    for (const observation of this.observations.values()) {
      this.stopObservation(observation);
      observation.reply?.retire();
    }
    this.observations.clear();
    this.resources.clear();
    this.bodies.clear();
    this.topics.clear();
    this.catalog.clear();
    this.state = { status: 'retired' };
    this.publishExecution();
    this.lease.release();
    for (const listener of this.stateListeners) listener();
    this.stateListeners.clear();
    this.executionListeners.clear();
  }
  async drain() {
    await this.actions.drain();
    while (this.work.size) await Promise.allSettled([...this.work]);
  }
}
