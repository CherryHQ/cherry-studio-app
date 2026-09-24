import {
  agentNotificationSchema,
  applyAgentEvents,
  installAgentCheckpoint,
  type AgentCheckpointPage,
  type AgentInteraction,
  type AgentPart,
  type AgentProjection,
  type ContentRef,
} from '@cherrystudio/remote-protocol/agent';

import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import { RemoteAgentError } from './RemoteAgentError';
import { decodeContent, integrity, readContent, type AgentRequest } from './remoteContent';

type Connection = {
  readContent?: (ref: ContentRef, signal: AbortSignal) => Promise<Uint8Array>;
  request: AgentRequest;
  onNotification(listener: (notification: DesktopNotification) => void): () => void;
};

/** Rebuilds from a desktop checkpoint; projection and cursor live only for this subscription. */
export class SessionSync {
  private readonly lifetime = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private unsubscribe?: () => void;
  private subscriptionId?: string;
  private projection?: AgentProjection;
  private started?: Promise<void>;
  private readonly textCache = new Map<string, string>();
  private interactionRevision?: string;
  private persistedInteractions: AgentInteraction[] = [];
  constructor(
    readonly sessionId: string,
    private readonly connection: Connection,
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
          await this.prepare();
          return;
        }
        if (!this.projection) throw new RemoteAgentError('PROTOCOL_ERROR');
        const parts = event.params.events.flatMap((item) =>
          item.kind === 'part.created' || item.kind === 'part.replaced' ? [item.payload.part] : [],
        );
        const content = await this.materialize(parts);
        const result = applyAgentEvents(this.projection, event.params, content, integrity);
        if (!result.ok) {
          await this.prepare();
          return;
        }
        await this.updateProjection(result.projection);
        await this.connection.request(
          'agent.subscriptions.ack',
          { subscriptionId: event.params.subscriptionId, cursor: result.cursor },
          this.lifetime.signal,
        );
      }).catch(() => undefined);
    });
    this.started = this.enqueue(() => this.prepare());
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
  private read(ref: ContentRef) {
    return (
      this.connection.readContent?.(ref, this.lifetime.signal) ??
      readContent(this.connection.request, this.sessionId, ref, this.lifetime.signal)
    );
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
      if (!content[key]) content[key] = await this.read(ref);
    }
    return content;
  }
  private async prepare(): Promise<void> {
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
      { sessionId: this.sessionId },
      this.lifetime.signal,
    );
    this.subscriptionId = prepared.subscriptionId;
    // There is no retained baseline to replay after a reconnect or reset.
    if (prepared.mode !== 'checkpoint') throw new RemoteAgentError('PROTOCOL_ERROR');
    this.interactionRevision = undefined;
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
    await this.updateProjection(installed.projection, false);
    await this.connection.request(
      'agent.subscriptions.activate',
      { subscriptionId: prepared.subscriptionId, appliedCursor: installed.cursor },
      this.lifetime.signal,
    );
    this.lifetime.signal.throwIfAborted();
    await this.present(installed.projection, true);
  }
  private async updateProjection(projection: AgentProjection, current = true) {
    this.lifetime.signal.throwIfAborted();
    this.projection = projection;
    await this.present(projection, current);
  }
  private async present(projection: AgentProjection, current: boolean) {
    this.lifetime.signal.throwIfAborted();
    const parts = { ...projection.parts };
    const view = () => ({
      ...projection,
      parts: { ...parts },
      interactions: Object.assign(
        Object.create(null),
        Object.fromEntries(this.persistedInteractions.map((item) => [item.interactionId, item])),
        projection.interactions,
      ),
    });
    for (const part of Object.values(parts)) {
      if ((part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content) {
        const ref = part.content.ref;
        const text = this.textCache.get(`${ref.contentId}:${ref.revision}:${ref.sha256}`);
        if (text !== undefined) parts[part.partId] = { ...part, content: { text } };
      }
    }
    // Readable projection need not wait for content or persisted interactions.
    // Only the final publication below grants current operation targets.
    this.publish(view(), false);
    const retained = new Set<string>();
    for (const part of Object.values(projection.parts)) {
      if ((part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content) {
        const ref = part.content.ref;
        const key = `${ref.contentId}:${ref.revision}:${ref.sha256}`;
        retained.add(key);
        let text = this.textCache.get(key);
        if (text === undefined) {
          try {
            text = decodeContent(await this.read(ref));
            this.textCache.set(key, text);
          } catch {
            this.lifetime.signal.throwIfAborted();
            continue;
          }
        }
        parts[part.partId] = { ...part, content: { text } };
      }
    }
    this.lifetime.signal.throwIfAborted();
    for (const key of this.textCache.keys()) if (!retained.has(key)) this.textCache.delete(key);
    this.publish(view(), false);
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
    this.publish(view(), current);
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
