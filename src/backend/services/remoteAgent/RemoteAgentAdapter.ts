import * as z from 'zod';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type { DesktopConnectionRuntime } from '@/backend/services/desktopConnections/DesktopConnectionRuntime';
import { JsonValueSchema } from '@/shared/contracts/agent';
import type {
  AgentController,
  AgentControllerConnection,
  ControllerAction,
  ControllerInteractionContent,
  ControllerSessionSnapshot,
} from '@/shared/contracts/agent/controller';
import { DataApiError } from '@/shared/data/api/errors';

import {
  AgentSchema,
  DetailSchema,
  InfoSchema,
  MessageSchema,
  pageSchema,
  projectMessage,
  projectSnapshot,
  QuestionsSchema,
  ResourceSchema,
  resourceRef,
  SessionSchema,
  SnapshotSchema,
  WorkspaceSchema,
} from './protocol';
import { RemoteAgentActions } from './RemoteAgentActions';
import { RemoteAgentClient, type RemoteAgentEvent, RemoteAgentError } from './RemoteAgentClient';
import { downloadArtifact, readContent } from './remoteContent';
import { utf8 } from './secureChannel';

type Observation = {
  listeners: Set<(snapshot: ControllerSessionSnapshot) => void>;
  subscription?: string;
  epoch?: string;
  seq: number;
  snapshot?: ControllerSessionSnapshot;
  subscribing?: Promise<void>;
};
const NO_CAPABILITIES = {
  workspaces: false,
  send: false,
  cancel: false,
  respond: false,
  details: false,
  artifacts: false,
};
const EMPTY_ACTIONS: readonly ControllerAction[] = [];
const BLOCKED = new Set([
  'agent-pairing-required',
  'auth-revoked',
  'agent-identity-changed',
  'agent-version',
  'IDENTITY_CHANGED',
  'PROTOCOL_ERROR',
  'JOURNAL_INVALID',
]);
const errorCode = (error: unknown) =>
  error instanceof DataApiError && typeof error.details?.reason === 'string'
    ? error.details.reason
    : error instanceof RemoteAgentError
      ? error.code
      : 'CONNECTION_LOST';

/** Implements application protocol v2; the PC remains the sole execution authority. */
export class RemoteAgentAdapter implements AgentController {
  readonly version = 2 as const;
  private state: AgentControllerConnection = {
    status: 'connecting',
    capabilities: NO_CAPABILITIES,
  };
  private readonly connectionListeners = new Set<() => void>();
  private readonly actionListeners = new Set<() => void>();
  private readonly observations = new Map<string, Observation>();
  private readonly lifetime = new AbortController();
  private readonly work = new Set<Promise<unknown>>();
  private readonly interactionInputs = new Map<
    string,
    {
      input: Record<string, z.infer<typeof JsonValueSchema>>;
      content: ControllerInteractionContent;
    }
  >();
  private actions?: RemoteAgentActions;
  private binding = '';
  private client?: RemoteAgentClient;
  private connecting?: Promise<RemoteAgentClient>;
  private generation = 0;
  private stopped = false;
  private suspended = false;
  private attempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private actionTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly id: string,
    private readonly credentials: DesktopConnectionRuntime,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly files: Pick<FileEntryService, 'create'>,
  ) {
    void this.ready().catch(() => undefined);
  }
  getConnection = () => this.state;
  subscribeConnection = (listener: () => void) => {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  };
  getActions = () => this.actions?.get() ?? EMPTY_ACTIONS;
  subscribeActions = (listener: () => void) => {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  };
  private setState(state: AgentControllerConnection) {
    this.state = { ...state, sourceKey: this.binding };
    if (state.status !== 'ready') {
      for (const observation of this.observations.values()) {
        observation.subscription = undefined;
        observation.epoch = undefined;
        observation.seq = 0;
        observation.subscribing = undefined;
        if (observation.snapshot?.current)
          this.publish(observation, { ...observation.snapshot, current: false });
      }
    }
    for (const listener of this.connectionListeners) listener();
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.work.add(promise);
    void promise.finally(() => this.work.delete(promise)).catch(() => undefined);
    return promise;
  }
  private ready(): Promise<RemoteAgentClient> {
    if (this.stopped || this.suspended) return Promise.reject(new RemoteAgentError('CLOSED'));
    if (this.client && this.state.status === 'ready') return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    if (this.state.error && BLOCKED.has(this.state.error))
      return Promise.reject(new RemoteAgentError(this.state.error));
    const generation = ++this.generation;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.setState({
      status: this.attempt ? 'reconnecting' : 'connecting',
      capabilities: this.state.capabilities,
    });
    const promise = (async () => {
      const target = await this.credentials.prepareAgentConnection(this.id, this.lifetime.signal);
      if (this.stopped || this.suspended || generation !== this.generation)
        throw new RemoteAgentError('CLOSED');
      const binding = `${this.id}:${target.generation}`;
      if (this.binding !== binding) {
        this.binding = binding;
        try {
          this.actions = new RemoteAgentActions(
            binding,
            this.journal,
            (method, params) => this.request(method, params),
            () => {
              this.refreshObserved();
              this.scheduleActionRecovery();
            },
          );
        } catch {
          throw new RemoteAgentError('JOURNAL_INVALID');
        }
        this.actions.subscribe(() => {
          for (const listener of this.actionListeners) listener();
        });
        for (const listener of this.actionListeners) listener();
      }
      const client = new RemoteAgentClient({
        ...target,
        onEvent: (event) => {
          if (generation === this.generation) this.receive(event);
        },
        onClose: (error) => {
          if (generation !== this.generation || this.stopped || this.suspended) return;
          this.client = undefined;
          this.setState({
            status: 'unavailable',
            capabilities: this.state.capabilities,
            error: error.code,
          });
          this.scheduleReconnect();
        },
      });
      this.client = client;
      await client.connected();
      const info = InfoSchema.parse(await client.request('system.info', {}, this.lifetime.signal));
      if (info.instanceId !== target.descriptor.instanceId)
        throw new RemoteAgentError('IDENTITY_CHANGED');
      if (generation !== this.generation || this.stopped || this.suspended)
        throw new RemoteAgentError('CLOSED');
      this.attempt = 0;
      const supports = (name: string) => info.capabilities.includes(name);
      if (!supports('agents') || !supports('session-snapshots') || !supports('command-receipts'))
        throw new RemoteAgentError('PROTOCOL_ERROR');
      this.setState({
        status: 'ready',
        capabilities: {
          workspaces: supports('workspaces'),
          send: supports('text'),
          cancel: supports('cancel'),
          respond: supports('tool-approval') && supports('interaction-details'),
          details: supports('message-details'),
          artifacts: supports('artifact-download'),
        },
      });
      for (const [sessionId, observation] of this.observations) {
        void this.subscribeSession(sessionId, observation).catch(() => undefined);
      }
      this.actions!.recover();
      return client;
    })()
      .catch((error: unknown) => {
        if (generation === this.generation && !this.stopped && !this.suspended) {
          this.client?.dispose();
          this.client = undefined;
          this.setState({
            status: 'unavailable',
            capabilities: this.state.capabilities,
            error: error instanceof z.ZodError ? 'PROTOCOL_ERROR' : errorCode(error),
          });
          this.scheduleReconnect();
        }
        throw error;
      })
      .finally(() => {
        if (this.connecting === promise) this.connecting = undefined;
      });
    this.connecting = promise;
    return this.track(promise);
  }
  private scheduleReconnect() {
    if (
      this.stopped ||
      this.suspended ||
      this.reconnectTimer ||
      (this.state.error && BLOCKED.has(this.state.error))
    )
      return;
    const delay =
      Math.min(30_000, 1000 * 2 ** Math.min(this.attempt++, 5)) + Math.floor(Math.random() * 500);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.ready().catch(() => undefined);
    }, delay);
  }
  reconnect = () => {
    if (this.stopped) return;
    ++this.generation;
    this.client?.dispose();
    this.client = undefined;
    this.connecting = undefined;
    this.setState({ status: 'connecting', capabilities: this.state.capabilities });
    void this.ready().catch(() => undefined);
  };
  setForeground(active: boolean) {
    if (this.suspended === !active) return;
    this.suspended = !active;
    if (active) this.reconnect();
    else {
      ++this.generation;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      clearTimeout(this.actionTimer);
      this.client?.dispose();
      this.client = undefined;
      this.connecting = undefined;
      this.setState({ status: 'unavailable', capabilities: this.state.capabilities });
    }
  }
  private request = async (
    method: string,
    params: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    signal?.throwIfAborted();
    const client = await this.ready();
    signal?.throwIfAborted();
    return this.track(client.request(method, params, signal ?? this.lifetime.signal));
  };
  async listAgents(cursor?: string, signal?: AbortSignal) {
    return pageSchema(AgentSchema).parse(
      await this.request('agents.list', { ...(cursor ? { cursor } : {}) }, signal),
    );
  }
  async listWorkspaces(cursor?: string, signal?: AbortSignal) {
    return pageSchema(WorkspaceSchema).parse(
      await this.request('workspaces.list', { ...(cursor ? { cursor } : {}) }, signal),
    );
  }
  async listSessions(agentId: string, cursor?: string, signal?: AbortSignal) {
    return pageSchema(SessionSchema).parse(
      await this.request('sessions.list', { agentId, ...(cursor ? { cursor } : {}) }, signal),
    );
  }
  async history(sessionId: string, cursor?: string, signal?: AbortSignal) {
    const page = pageSchema(MessageSchema).parse(
      await this.request('messages.list', { sessionId, ...(cursor ? { cursor } : {}) }, signal),
    );
    this.actions?.acknowledgeHistory(sessionId, new Set(page.items.map((message) => message.id)));
    return {
      ...page,
      items: page.items.map((message) => projectMessage(message, sessionId, this.binding)),
    };
  }
  observe(sessionId: string, listener: (snapshot: ControllerSessionSnapshot) => void): () => void {
    let observation = this.observations.get(sessionId);
    if (!observation) {
      observation = { listeners: new Set(), seq: 0 };
      this.observations.set(sessionId, observation);
    }
    observation.listeners.add(listener);
    // Cached content may remain visible, but freshness is communicated separately by connection state.
    if (observation.snapshot) listener(observation.snapshot);
    void this.subscribeSession(sessionId, observation).catch(() => undefined);
    return () => {
      observation.listeners.delete(listener);
      if (observation.listeners.size) return;
      this.observations.delete(sessionId);
      if (observation.subscription && this.client)
        void this.client
          .request('unsubscribe', { subscriptionId: observation.subscription })
          .catch(() => undefined);
    };
  }
  private subscribeSession(sessionId: string, observation: Observation): Promise<void> {
    if (observation.subscribing) return observation.subscribing;
    if (observation.subscription) return Promise.resolve();
    const work = (async () => {
      const client = await this.ready();
      if (this.observations.get(sessionId) !== observation || client !== this.client) return;
      const { subscriptionId } = z
        .object({ subscriptionId: z.string() })
        .parse(await client.request('session.subscribe', { sessionId }, this.lifetime.signal));
      if (this.client !== client) return;
      if (this.observations.get(sessionId) !== observation) {
        // A new observer may be subscribing to the same server-side subscription.
        if (this.observations.has(sessionId)) return;
        await client.request('unsubscribe', { subscriptionId });
        return;
      }
      observation.subscription = subscriptionId;
      await this.refreshSession(sessionId, observation);
    })().finally(() => {
      if (observation.subscribing === work) observation.subscribing = undefined;
    });
    observation.subscribing = work;
    return work;
  }
  private receive(event: RemoteAgentEvent) {
    if (event.event !== 'session.snapshot') return;
    const observation = this.observations.get(event.sessionId);
    if (
      !observation ||
      observation.subscription !== event.subscriptionId ||
      (observation.epoch && observation.epoch !== event.subscriptionEpoch) ||
      event.eventSeq <= observation.seq
    )
      return;
    const value = SnapshotSchema.parse(event.data);
    if (value.session.id !== event.sessionId) throw new RemoteAgentError('PROTOCOL_ERROR');
    observation.subscription = event.subscriptionId;
    observation.epoch = event.subscriptionEpoch;
    observation.seq = event.eventSeq;
    this.publish(observation, projectSnapshot(value, this.binding));
  }
  private publish(observation: Observation, snapshot: ControllerSessionSnapshot) {
    observation.snapshot = snapshot;
    const activeInputs = new Set(
      snapshot.interactions.map((item) => `${snapshot.session.id}:${item.id}`),
    );
    for (const key of this.interactionInputs.keys()) {
      if (key.startsWith(`${snapshot.session.id}:`) && !activeInputs.has(key))
        this.interactionInputs.delete(key);
    }
    for (const listener of observation.listeners) listener(snapshot);
  }
  private async refreshSession(sessionId: string, observation: Observation) {
    const sequence = observation.seq;
    const client = this.client;
    const value = SnapshotSchema.parse(await this.request('sessions.get', { sessionId }));
    if (
      this.client !== client ||
      observation.seq !== sequence ||
      this.observations.get(sessionId) !== observation
    )
      return;
    this.publish(observation, projectSnapshot(value, this.binding));
  }
  private refreshObserved() {
    if (this.state.status !== 'ready') return;
    for (const [id, observation] of this.observations)
      void this.refreshSession(id, observation).catch(() => undefined);
  }
  private scheduleActionRecovery() {
    clearTimeout(this.actionTimer);
    if (
      !this.stopped &&
      !this.suspended &&
      this.getActions().some((action) => action.status === 'confirming')
    ) {
      this.actionTimer = setTimeout(() => this.actions?.recover(), 5000);
    }
  }
  async createSession(agentId: string, workspaceId?: string) {
    await this.ready();
    return this.track(
      this.actions!.create('create', 'sessions.create', {
        agentId,
        ...(workspaceId ? { workspaceId } : {}),
      }),
    );
  }
  async sendMessage(sessionId: string, text: string) {
    if (!text.trim() || utf8(text).length > 65536) throw new RemoteAgentError('MESSAGE_TOO_LARGE');
    await this.ready();
    if (!this.state.capabilities.send) throw new RemoteAgentError('UNSUPPORTED');
    return this.track(
      this.actions!.create(
        'send',
        'messages.send',
        { sessionId, parts: [{ type: 'text', text }] },
        text,
      ),
    );
  }
  async cancel(sessionId: string, executionId: string) {
    await this.ready();
    if (!this.state.capabilities.cancel) throw new RemoteAgentError('UNSUPPORTED');
    return this.track(
      this.actions!.create('cancel', 'turns.cancel', {
        sessionId,
        expectedExecutionId: executionId,
      }),
    );
  }
  async respond(
    sessionId: string,
    interactionId: string,
    response: { approved: boolean; reason?: string; answers?: Record<string, string> },
  ) {
    await this.ready();
    const original = this.interactionInputs.get(`${sessionId}:${interactionId}`);
    if (response.answers && !original?.content.questions)
      throw new RemoteAgentError('INTERACTION_UNSUPPORTED');
    if (!this.state.capabilities.respond) throw new RemoteAgentError('UNSUPPORTED');
    return this.track(
      this.actions!.create('respond', 'interactions.respond', {
        sessionId,
        interactionId,
        response: {
          approved: response.approved,
          ...(response.reason ? { reason: response.reason } : {}),
          ...(response.answers && original
            ? { updatedInput: { ...original.input, answers: response.answers } }
            : {}),
        },
      }),
    );
  }
  async retryAction(id: string) {
    await this.ready();
    if (this.actions) await this.track(this.actions.retry(id));
  }
  dismissAction(id: string) {
    this.actions?.dismiss(id);
  }
  async interaction(sessionId: string, id: string, signal?: AbortSignal) {
    const loaded = await readContent(
      this.request,
      'interactions.get',
      { sessionId, interactionId: id },
      signal,
    );
    const input = JsonValueSchema.parse(
      loaded.encoding === 'json' ? JSON.parse(loaded.text) : loaded.text,
    );
    const notice = this.observations
      .get(sessionId)
      ?.snapshot?.interactions.find((entry) => entry.id === id);
    const isQuestion =
      notice?.toolName === 'AskUserQuestion' || notice?.toolName === 'builtin_AskUserQuestion';
    const questions = isQuestion ? QuestionsSchema.safeParse(input) : undefined;
    if (isQuestion && !questions?.success) throw new RemoteAgentError('INTERACTION_UNSUPPORTED');
    const content: ControllerInteractionContent = {
      id,
      input,
      ...(questions?.success
        ? {
            questions: questions.data.questions.map((question) => ({
              ...question,
              multiple: question.multiSelect,
            })),
          }
        : {}),
    };
    if (input && typeof input === 'object' && !Array.isArray(input))
      this.interactionInputs.set(`${sessionId}:${id}`, { input, content });
    return content;
  }
  async details(sessionId: string, messageId: string, cursor?: string, signal?: AbortSignal) {
    const page = pageSchema(DetailSchema).parse(
      await this.request(
        'messages.parts.list',
        { sessionId, messageId, ...(cursor ? { cursor } : {}) },
        signal,
      ),
    );
    return {
      ...page,
      items: page.items.map((detail) => ({
        id: `${messageId}:${detail.partIndex}`,
        type: detail.type,
        name: detail.name,
        state: detail.state,
        fields: detail.fields.map((field) => ({
          name: field,
          resource: resourceRef({
            binding: this.binding,
            sessionId,
            messageId,
            partIndex: detail.partIndex,
            field,
          }),
        })),
      })),
    };
  }
  private resource(value: string) {
    const { binding, ...resource } = ResourceSchema.parse(JSON.parse(value));
    if (binding !== this.binding) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
    return resource;
  }
  async readDetail(value: string, signal?: AbortSignal) {
    await this.ready();
    const resource = this.resource(value);
    if (!resource.field) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
    const result = await readContent(this.request, 'messages.parts.get', resource, signal);
    return result.encoding === 'json'
      ? JSON.stringify(JSON.parse(result.text), null, 2)
      : result.text;
  }
  download(
    value: string,
    signal: AbortSignal,
    progress: (received: number, total: number) => void,
  ) {
    return this.track(
      (async () => {
        await this.ready();
        const { field: _field, ...resource } = this.resource(value);
        return downloadArtifact(this.request, resource, this.files, signal, progress);
      })(),
    );
  }
  dispose() {
    this.stopped = true;
    this.actions?.stop();
    ++this.generation;
    this.lifetime.abort();
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.actionTimer);
    this.client?.dispose();
    this.client = undefined;
    this.observations.clear();
    this.interactionInputs.clear();
    this.setState({ status: 'closed', capabilities: NO_CAPABILITIES });
  }
  async drain() {
    await Promise.allSettled([...this.work]);
    await this.actions?.drain();
  }
}
