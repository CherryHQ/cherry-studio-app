import type { AgentPart, ContentRef } from '@cherrystudio/remote-protocol/agent';
import {
  assistantNotificationSchema,
  applyAssistantEvents,
  installAssistantCheckpoint,
  type AssistantCheckpointPage,
  type AssistantInteraction,
  type AssistantProjection,
  type AssistantTopic,
} from '@cherrystudio/remote-protocol/assistant';

import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import { RemoteConversationError, decodeContent, integrity } from '../remoteConversation';
import type { AssistantRequest } from './assistantRequest';

type Connection = {
  readContent: (ref: ContentRef, topic: AssistantTopic, signal: AbortSignal) => Promise<Uint8Array>;
  request: AssistantRequest;
  onNotification(listener: (notification: DesktopNotification) => void): () => void;
};

type Notification = ReturnType<typeof assistantNotificationSchema.parse>;
type TextPart = Extract<AgentPart, { kind: 'text' | 'reasoning' }>;

const PRESENT_INTERVAL_MS = 100;

/** Rebuilds from a desktop checkpoint; projection and cursor live only for this subscription. */
export class TopicSync {
  private readonly lifetime = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private inbox: Notification[] = [];
  private ack?: { subscriptionId: string; cursor: AssistantProjection['cursor'] };
  private acking = false;
  private presenting = false;
  private presentTimer?: ReturnType<typeof setTimeout>;
  private presentedAt = 0;
  private unsubscribe?: () => void;
  private subscriptionId?: string;
  private projection?: AssistantProjection;
  private started?: Promise<void>;
  private readonly textCache = new Map<string, string>();
  private readonly materializedParts = new WeakMap<TextPart, TextPart>();
  private interactionRevision?: string;
  private persistedInteractions: AssistantInteraction[] = [];
  constructor(
    readonly topicId: string,
    private readonly connection: Connection,
    private readonly publish: (projection: AssistantProjection, current: boolean) => void,
    private readonly failed: (error: unknown) => void,
  ) {}
  get current() {
    return this.projection;
  }
  start(): Promise<void> {
    if (this.started) return this.started;
    this.unsubscribe = this.connection.onNotification((notification) => {
      if (!notification.method.startsWith('assistant.')) return;
      const parsed = assistantNotificationSchema.safeParse({ jsonrpc: '2.0', ...notification });
      if (!parsed.success) {
        this.failed(new RemoteConversationError('PROTOCOL_ERROR'));
        return;
      }
      const event = parsed.data;
      if (event.params.subscriptionId !== this.subscriptionId) return;
      this.inbox.push(event);
      if (this.inbox.length === 1)
        void this.enqueue(() => this.applyInbox()).catch(() => undefined);
    });
    this.started = this.enqueue(() => this.prepare());
    return this.started;
  }
  /** Applies every batch that arrived meanwhile, then presents once; ACK tracks application, not rendering. */
  private async applyInbox() {
    let applied = false;
    let structural = false;
    try {
      while (this.inbox.length) {
        const event = this.inbox[0]!;
        if (event.params.subscriptionId === this.subscriptionId) {
          if (event.method === 'assistant.subscriptions.resetRequired') {
            applied = false;
            await this.prepare();
          } else {
            if (!this.projection) throw new RemoteConversationError('PROTOCOL_ERROR');
            const parts = event.params.events.flatMap((item) =>
              item.kind === 'part.updated'
                ? [item.part]
                : item.kind === 'part.append' && this.projection?.parts[item.partId]
                  ? [this.projection.parts[item.partId]]
                  : [],
            );
            const topic =
              event.params.events.findLast((item) => item.kind === 'topic.updated')?.topic ??
              this.projection.topic;
            const content = await this.materialize(parts, topic);
            this.lifetime.signal.throwIfAborted();
            const result = applyAssistantEvents(this.projection, event.params, content, integrity);
            if (result.ok) {
              this.projection = result.projection;
              applied = true;
              structural ||= event.params.events.some((item) => item.kind !== 'part.append');
            } else {
              applied = false;
              await this.prepare();
            }
          }
        }
        // Removing only after handling keeps later notifications from starting a second drain.
        this.inbox.shift();
      }
    } catch (error) {
      this.inbox = [];
      throw error;
    }
    if (!applied || !this.projection || !this.subscriptionId) return;
    this.acknowledge(this.subscriptionId, this.projection.cursor);
    this.schedulePresent(structural);
  }
  private acknowledge(subscriptionId: string, cursor: AssistantProjection['cursor']) {
    this.ack = { subscriptionId, cursor };
    if (this.acking) return;
    this.acking = true;
    void (async () => {
      try {
        for (let ack = this.ack; ack; ack = this.ack) {
          this.ack = undefined;
          if (ack.subscriptionId !== this.subscriptionId) continue;
          try {
            await this.connection.request('assistant.subscriptions.ack', ack, this.lifetime.signal);
          } catch (error) {
            // A reset may close the subscription while its last ACK is in flight.
            if (!this.lifetime.signal.aborted && ack.subscriptionId === this.subscriptionId)
              this.failed(error);
            return;
          }
        }
      } finally {
        this.acking = false;
      }
    })();
  }
  /** Streamed text commits at most once per interval, like local sessions; other changes present at once. */
  private schedulePresent(immediate: boolean) {
    if (this.presenting) return;
    const delay = immediate ? 0 : this.presentedAt + PRESENT_INTERVAL_MS - Date.now();
    if (delay > 0) {
      this.presentTimer ??= setTimeout(() => this.queuePresent(), delay);
      return;
    }
    this.queuePresent();
  }
  private queuePresent() {
    clearTimeout(this.presentTimer);
    this.presentTimer = undefined;
    if (this.presenting) return;
    this.presenting = true;
    void this.enqueue(async () => {
      this.presenting = false;
      if (this.projection) await this.present(this.projection, true);
    }).catch(() => undefined);
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
  private read(ref: ContentRef, topic: AssistantTopic) {
    return this.connection.readContent(ref, topic, this.lifetime.signal);
  }
  private async materialize(parts: AgentPart[], topic: AssistantTopic) {
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
      if (!content[key]) content[key] = await this.read(ref, topic);
    }
    return content;
  }
  private async prepare(): Promise<void> {
    if (this.projection) this.publish(this.projection, false);
    if (this.subscriptionId) {
      const subscriptionId = this.subscriptionId;
      this.subscriptionId = undefined;
      await this.connection.request('assistant.subscriptions.close', { subscriptionId });
    }
    this.lifetime.signal.throwIfAborted();
    // Allocation must settle even after stop, so its returned subscription can be closed.
    const prepared = await this.connection.request('assistant.topics.subscribe', {
      topicId: this.topicId,
    });
    this.subscriptionId = prepared.subscriptionId;
    this.lifetime.signal.throwIfAborted();
    // There is no retained baseline to replay after a reconnect or reset.
    if (prepared.mode !== 'checkpoint') throw new RemoteConversationError('PROTOCOL_ERROR');
    this.interactionRevision = undefined;
    const pages: AssistantCheckpointPage[] = [];
    let pageCursor: string | undefined;
    for (let index = 0; index < prepared.checkpoint.pageCount; index++) {
      const page = await this.connection.request(
        'assistant.checkpoints.read',
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
    const topic = pages.flatMap((page) => page.items).find((item) => item.kind === 'topic')?.value;
    if (!topic) throw new RemoteConversationError('PROTOCOL_ERROR');
    const content = await this.materialize(
      pages.flatMap((page) =>
        page.items.flatMap((item) => (item.kind === 'part' ? [item.value] : [])),
      ),
      topic,
    );
    const installed = installAssistantCheckpoint(prepared.checkpoint, pages, content, integrity);
    if (!installed.ok || installed.cursor.topicId !== this.topicId)
      throw new RemoteConversationError('PROTOCOL_ERROR');
    await this.updateProjection(installed.projection, false);
    await this.connection.request(
      'assistant.subscriptions.activate',
      { subscriptionId: prepared.subscriptionId, appliedCursor: installed.cursor },
      this.lifetime.signal,
    );
    this.lifetime.signal.throwIfAborted();
    await this.present(installed.projection, true);
  }
  private async updateProjection(projection: AssistantProjection, current = true) {
    this.lifetime.signal.throwIfAborted();
    this.projection = projection;
    await this.present(projection, current);
  }
  private async present(projection: AssistantProjection, current: boolean) {
    this.lifetime.signal.throwIfAborted();
    this.presentedAt = Date.now();
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
    const retained = new Set<string>();
    const missing: { part: TextPart; ref: ContentRef; key: string }[] = [];
    for (const part of Object.values(parts)) {
      if ((part.kind === 'text' || part.kind === 'reasoning') && 'ref' in part.content) {
        const ref = part.content.ref;
        const key = `${ref.contentId}:${ref.revision}:${ref.sha256}`;
        retained.add(key);
        const text = this.textCache.get(key);
        if (text !== undefined) parts[part.partId] = this.materialized(part, text);
        else missing.push({ part, ref, key });
      }
    }
    for (const key of this.textCache.keys()) if (!retained.has(key)) this.textCache.delete(key);
    const refresh = current && this.interactionRevision !== projection.topic.historyRevision;
    // Readable projection need not wait for content or persisted interactions.
    // Only the final publication below grants current operation targets.
    if (missing.length || refresh) this.publish(view(), false);
    for (const { part, ref, key } of missing) {
      try {
        const text = decodeContent(await this.read(ref, projection.topic));
        this.textCache.set(key, text);
        parts[part.partId] = this.materialized(part, text);
      } catch {
        this.lifetime.signal.throwIfAborted();
      }
    }
    this.lifetime.signal.throwIfAborted();
    if (missing.length && refresh) this.publish(view(), false);
    if (refresh) {
      const interactions: AssistantInteraction[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.connection.request(
          'assistant.interactions.list',
          { topicId: this.topicId, cursor },
          this.lifetime.signal,
        );
        interactions.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      this.persistedInteractions = interactions;
      this.interactionRevision = projection.topic.historyRevision;
    }
    this.lifetime.signal.throwIfAborted();
    this.publish(view(), current);
  }
  /** Unchanged parts keep one materialized object, so message views projected from them are reused. */
  private materialized(part: TextPart, text: string): TextPart {
    let value = this.materializedParts.get(part);
    if (!value) {
      value = { ...part, content: { text } };
      this.materializedParts.set(part, value);
    }
    return value;
  }
  stop() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    clearTimeout(this.presentTimer);
    this.unsubscribe?.();
    this.tail = this.tail
      .then(async () => {
        const subscriptionId = this.subscriptionId;
        this.subscriptionId = undefined;
        if (subscriptionId)
          await this.connection.request('assistant.subscriptions.close', { subscriptionId });
      })
      .catch(() => undefined);
  }
  async drain() {
    await this.tail;
  }
}
