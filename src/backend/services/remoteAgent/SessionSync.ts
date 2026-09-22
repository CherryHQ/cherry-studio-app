import {
  agentNotificationSchema,
  applyAgentEvents,
  installAgentCheckpoint,
  type AgentCheckpointPage,
  type AgentCursor,
  type AgentInteraction,
  type AgentPart,
  type AgentProjection,
} from '@cherrystudio/remote-protocol/agent';

import type { SessionProjectionStore } from '@/backend/data/services/RemoteSessionProjectionStore';
import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import { RemoteAgentError } from './RemoteAgentError';
import { decodeContent, integrity, readContent, type AgentRequest } from './remoteContent';

type Connection = {
  request: AgentRequest;
  onNotification(listener: (notification: DesktopNotification) => void): () => void;
};

/** Serializes checkpoint installation, notification reduction, durable cursor writes, and ACKs. */
export class SessionSync {
  private readonly lifetime = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private unsubscribe?: () => void;
  private subscriptionId?: string;
  private projection?: AgentProjection;
  private started?: Promise<void>;
  private highWatermark?: AgentCursor;
  private readonly textCache = new Map<string, string>();
  private interactionRevision?: string;
  private persistedInteractions: AgentInteraction[] = [];
  constructor(
    private readonly connectionId: string,
    private readonly scopeId: string,
    readonly sessionId: string,
    private readonly connection: Connection,
    private readonly store: SessionProjectionStore,
    private readonly publish: (projection: AgentProjection, current: boolean) => void,
    private readonly failed: (error: unknown) => void,
  ) {}
  get current() {
    return this.projection;
  }
  start(): Promise<void> {
    if (this.started) return this.started;
    this.unsubscribe = this.connection.onNotification((notification) => {
      if (!notification.method.startsWith('agent.')) return;
      const parsed = agentNotificationSchema.safeParse({ jsonrpc: '2.0', ...notification });
      if (!parsed.success) {
        this.failed(new RemoteAgentError('PROTOCOL_ERROR'));
        return;
      }
      const event = parsed.data;
      if (event.params.subscriptionId !== this.subscriptionId) return;
      void this.enqueue(async () => {
        if (event.params.subscriptionId !== this.subscriptionId) return;
        if (event.method === 'agent.subscriptions.resetRequired') {
          await this.prepare(false);
          return;
        }
        if (!this.projection) throw new RemoteAgentError('PROTOCOL_ERROR');
        const parts = event.params.events.flatMap((item) =>
          item.kind === 'part.created' || item.kind === 'part.replaced' ? [item.payload.part] : [],
        );
        const content = await this.materialize(parts);
        const result = applyAgentEvents(this.projection, event.params, content, integrity);
        if (!result.ok) {
          await this.prepare(false);
          return;
        }
        await this.commit(result.projection);
        await this.connection.request(
          'agent.subscriptions.ack',
          { subscriptionId: event.params.subscriptionId, cursor: result.cursor },
          this.lifetime.signal,
        );
      }).catch(() => undefined);
    });
    this.started = this.enqueue(async () => {
      this.projection = await this.store.read(this.connectionId, this.scopeId, this.sessionId);
      this.lifetime.signal.throwIfAborted();
      if (this.projection) this.publish(this.projection, false);
      await this.prepare(true);
    });
    return this.started;
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.tail.then(async () => {
      this.lifetime.signal.throwIfAborted();
      await work();
    });
    this.tail = pending.catch((error: unknown) => {
      if (!this.lifetime.signal.aborted) this.failed(error);
    });
    return pending;
  }
  private async materialize(parts: AgentPart[]) {
    const content: Record<string, Uint8Array> = Object.create(null);
    for (const part of parts) {
      if (
        (part.kind !== 'text' && part.kind !== 'reasoning' && part.kind !== 'tool-input') ||
        part.state !== 'streaming' ||
        !('ref' in part.content)
      )
        continue;
      const ref = part.content.ref;
      const key = `${ref.contentId}:${ref.revision}`;
      if (!content[key])
        content[key] = await readContent(
          this.connection.request,
          this.sessionId,
          ref,
          this.lifetime.signal,
        );
    }
    return content;
  }
  private async prepare(resume: boolean): Promise<void> {
    if (this.projection) this.publish(this.projection, false);
    if (this.subscriptionId) {
      const subscriptionId = this.subscriptionId;
      this.subscriptionId = undefined;
      await this.connection.request(
        'agent.subscriptions.close',
        { subscriptionId },
        this.lifetime.signal,
      );
    }
    const prepared = await this.connection.request(
      'agent.sessions.subscribe',
      {
        sessionId: this.sessionId,
        ...(resume && this.projection ? { cursor: this.projection.cursor } : {}),
      },
      this.lifetime.signal,
    );
    this.subscriptionId = prepared.subscriptionId;
    this.highWatermark =
      prepared.mode === 'replay' ? prepared.highWatermark : prepared.checkpoint.cursor;
    this.interactionRevision = undefined;
    if (prepared.mode === 'checkpoint') {
      const pages: AgentCheckpointPage[] = [];
      let pageCursor: string | undefined;
      for (let index = 0; index < prepared.checkpoint.pageCount; index++) {
        const page = await this.connection.request(
          'agent.checkpoints.read',
          {
            subscriptionId: prepared.subscriptionId,
            checkpointId: prepared.checkpoint.checkpointId,
            ...(pageCursor ? { pageCursor } : {}),
          },
          this.lifetime.signal,
        );
        pages.push(page);
        pageCursor = page.nextCursor ?? undefined;
      }
      const content = await this.materialize(
        pages.flatMap((page) =>
          page.items.flatMap((item) => (item.kind === 'part' ? [item.value] : [])),
        ),
      );
      const installed = installAgentCheckpoint(prepared.checkpoint, pages, content, integrity);
      if (!installed.ok || installed.cursor.sessionId !== this.sessionId)
        throw new RemoteAgentError('PROTOCOL_ERROR');
      await this.commit(installed.projection, false);
    } else if (
      !this.projection ||
      prepared.fromCursor.sessionId !== this.projection.cursor.sessionId ||
      prepared.fromCursor.streamEpoch !== this.projection.cursor.streamEpoch ||
      prepared.fromCursor.seq !== this.projection.cursor.seq ||
      prepared.highWatermark.sessionId !== this.sessionId ||
      prepared.highWatermark.streamEpoch !== this.projection.cursor.streamEpoch ||
      BigInt(prepared.highWatermark.seq) < BigInt(this.projection.cursor.seq)
    ) {
      throw new RemoteAgentError('PROTOCOL_ERROR');
    }
    if (!this.projection) throw new RemoteAgentError('PROTOCOL_ERROR');
    await this.connection.request(
      'agent.subscriptions.activate',
      { subscriptionId: prepared.subscriptionId, appliedCursor: this.projection.cursor },
      this.lifetime.signal,
    );
    this.lifetime.signal.throwIfAborted();
    await this.present(this.projection, true);
  }
  private async commit(projection: AgentProjection, current = true) {
    // Completed referenced text also has to be readable by the consumer; preserve refs in storage.
    await this.store.write(this.connectionId, this.scopeId, projection, this.lifetime.signal);
    this.lifetime.signal.throwIfAborted();
    this.projection = projection;
    await this.present(projection, current);
  }
  private async present(projection: AgentProjection, current: boolean) {
    const parts = { ...projection.parts };
    const retained = new Set<string>();
    for (const part of Object.values(parts)) {
      if ((part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content) {
        const ref = part.content.ref;
        const key = `${ref.contentId}:${ref.revision}:${ref.sha256}`;
        retained.add(key);
        let text = this.textCache.get(key);
        if (text === undefined) {
          text = decodeContent(
            await readContent(this.connection.request, this.sessionId, ref, this.lifetime.signal),
          );
          this.textCache.set(key, text);
        }
        parts[part.partId] = { ...part, content: { text } };
      }
    }
    this.lifetime.signal.throwIfAborted();
    for (const key of this.textCache.keys()) if (!retained.has(key)) this.textCache.delete(key);
    if (current && this.interactionRevision !== projection.session.historyRevision) {
      const interactions: AgentInteraction[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.connection.request(
          'agent.interactions.list',
          { sessionId: this.sessionId, cursor },
          this.lifetime.signal,
        );
        interactions.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      this.persistedInteractions = interactions;
      this.interactionRevision = projection.session.historyRevision;
    }
    this.lifetime.signal.throwIfAborted();
    const interactions = Object.assign(
      Object.create(null),
      Object.fromEntries(this.persistedInteractions.map((item) => [item.interactionId, item])),
      projection.interactions,
    );
    const caughtUp =
      !this.highWatermark ||
      (projection.cursor.streamEpoch === this.highWatermark.streamEpoch &&
        BigInt(projection.cursor.seq) >= BigInt(this.highWatermark.seq));
    this.publish({ ...projection, parts, interactions }, current && caughtUp);
  }
  stop() {
    this.lifetime.abort();
    this.unsubscribe?.();
    const subscriptionId = this.subscriptionId;
    this.subscriptionId = undefined;
    if (subscriptionId)
      this.tail = this.tail
        .then(() => this.connection.request('agent.subscriptions.close', { subscriptionId }))
        .then(() => undefined)
        .catch(() => undefined);
  }
  async drain() {
    await this.tail;
  }
}
