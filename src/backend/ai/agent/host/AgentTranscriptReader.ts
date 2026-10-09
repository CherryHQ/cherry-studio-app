import { z } from 'zod';

import type { AgentMessageView } from '@/shared/contracts/agent';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
  AgentTranscriptSelectionSchema,
  ListAgentSessionMessagesQuerySchema,
  type AgentSessionMessagePage,
  type AgentSessionMessageReader,
  type ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import type { DurableAgentRuntime, RuntimeDurableTurn } from '../runtime';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import type { AgentDefinitionSource } from './agentDefinitions';
import { projectDurableHostTurn } from './durableHostProjection';

type LegacyReader = AgentSessionMessageReader & {
  listByCursor(
    sessionId: string,
    params?: ListAgentSessionMessagesQueryParams,
    throughMessageId?: string,
  ): Promise<AgentSessionMessagePage>;
};
const PositionSchema = z.object({
  sessionId: z.string(),
  id: z.string(),
  source: z.enum(['native', 'legacy', 'pending']),
  boundary: z.string().optional(),
});
type Position = z.infer<typeof PositionSchema>;
type Row = { message: AgentMessageView; position: Position };
type Origin = { sourceSessionId: string; throughMessageId: string } | null;
const CURSOR_PREFIX = 'durable-v1:';

/** Reads native history plus an immutable SQL prefix; never persists a second assistant transcript. */
export class AgentTranscriptReader implements AgentSessionMessageReader {
  constructor(
    private readonly runtime: () => DurableAgentRuntime | undefined,
    private readonly pending: (sessionId: string) => readonly RuntimeDurableTurn[],
    private readonly store: AgentSessionStore,
    private readonly agents: AgentDefinitionSource,
    private readonly legacy: LegacyReader,
    private readonly messageStats?: (
      id: string,
    ) => Promise<import('@/shared/data/types/messageStats').MessageStats>,
  ) {}

  async listByCursor(sessionId: string, params: ListAgentSessionMessagesQueryParams = {}) {
    const query = ListAgentSessionMessagesQuerySchema.parse(params);
    const runtime = this.runtime();
    const info = await runtime?.conversationInfo(sessionId);
    if (!runtime || !info) return this.legacy.listByCursor(sessionId, params);
    if (!(await this.store.getSession(sessionId)))
      throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    const origin = info.legacy;
    if (query.ids) {
      const rows = await this.selected(runtime, sessionId, origin, query.ids);
      return { items: await this.enrich(rows.map((row) => row.message)) };
    }
    const limit = query.limit ?? AGENT_SESSION_MESSAGES_DEFAULT_LIMIT;
    if (query.aroundMessageId) {
      const target = (await this.selected(runtime, sessionId, origin, [query.aroundMessageId]))[0];
      if (!target) throw DataApiErrorFactory.notFound('AgentSessionMessage', query.aroundMessageId);
      const olderCount = Math.floor((limit - 1) / 2);
      const newerCount = limit - 1 - olderCount;
      const [older, newer] = await Promise.all([
        this.older(runtime, sessionId, origin, target.position, olderCount + 1),
        this.newer(runtime, sessionId, origin, target.position, newerCount + 1),
      ]);
      const rows = [
        ...(newerCount ? newer.slice(-newerCount) : []),
        target,
        ...older.slice(0, olderCount),
      ];
      return this.page(rows, older.length > olderCount, newer.length > newerCount);
    }
    const position = decodePosition(query.cursor, sessionId);
    const isNewer = query.direction === 'newer';
    if (isNewer && !position)
      throw DataApiErrorFactory.validation({ cursor: ['Invalid message cursor'] });
    const rows = isNewer
      ? await this.newer(runtime, sessionId, origin, position!, limit + 1)
      : await this.older(runtime, sessionId, origin, position, limit + 1);
    return this.page(
      isNewer ? rows.slice(-limit) : rows.slice(0, limit),
      isNewer ? Boolean(position) : rows.length > limit,
      isNewer ? rows.length > limit : Boolean(position),
    );
  }

  async readSelection(sessionId: string, ids: string[]) {
    const query = AgentTranscriptSelectionSchema.parse({ ids });
    const runtime = this.runtime();
    const info = await runtime?.conversationInfo(sessionId);
    if (!runtime || !info) return this.legacy.readSelection(sessionId, ids);
    const session = await this.store.getSession(sessionId);
    if (!session) throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    const rows = await this.selected(runtime, sessionId, info.legacy, query.ids);
    if (rows.length !== new Set(query.ids).size)
      throw DataApiErrorFactory.notFound('AgentSessionMessage', sessionId);
    if (rows.some(({ message }) => message.status === 'pending' || message.status === 'streaming'))
      throw DataApiErrorFactory.validation({ ids: ['Only settled messages can be exported'] });
    const agent = await this.agents.getAgent(session.agentId).catch(() => null);
    return {
      session,
      assistantName: agent?.name,
      messages: await this.enrich(rows.toReversed().map((row) => row.message)),
    };
  }

  private async selected(
    runtime: DurableAgentRuntime,
    sessionId: string,
    origin: Origin,
    ids: readonly string[],
  ) {
    const rows: Row[] = [];
    const absent: string[] = [];
    for (const id of new Set(ids)) {
      const selected = await runtime.message(sessionId, id);
      if (selected) {
        const row = turnRows(selected.turn).find((row) => row.message.id === id);
        if (row) rows.push(row);
        else absent.push(id);
      } else absent.push(id);
    }
    if (absent.length && origin) {
      const page = await this.legacy.listByCursor(
        origin.sourceSessionId,
        { ids: absent },
        origin.throughMessageId,
      );
      rows.push(...page.items.map((message) => legacyRow(sessionId, message)));
    }
    // Correlation IDs are stable; source timestamps retain the original history order across forks.
    return rows.sort(
      (a, b) =>
        Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt) ||
        (a.message.turnId === b.message.turnId && a.message.role !== b.message.role
          ? a.message.role === 'assistant'
            ? -1
            : 1
          : b.message.id.localeCompare(a.message.id)),
    );
  }

  private async older(
    runtime: DurableAgentRuntime,
    sessionId: string,
    origin: Origin,
    position: Position | null,
    limit: number,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    let found = !position || position.source === 'legacy';
    for await (const row of this.rows(
      runtime,
      sessionId,
      origin,
      position?.source === 'native' ? position.boundary : undefined,
      position?.source === 'legacy' ? position.boundary : undefined,
      position?.source,
    )) {
      if (!found) {
        if (row.message.id === position!.id) found = true;
        continue;
      }
      rows.push(row);
      if (rows.length === limit) break;
    }
    // A withdrawn pending input or a stale cursor restarts browsing without locking the UI.
    if (position && !found) return this.older(runtime, sessionId, origin, null, limit);
    return rows;
  }

  /** Native entries scan newest first by default. Retain only the nearest requested newer neighbors. */
  private async newer(
    runtime: DurableAgentRuntime,
    sessionId: string,
    origin: Origin,
    position: Position,
    limit: number,
  ) {
    const nearest: Row[] = [];
    for await (const row of this.rows(runtime, sessionId, origin)) {
      if (row.message.id === position.id) return nearest;
      nearest.push(row);
      if (nearest.length > limit) nearest.shift();
    }
    return [];
  }

  private async *rows(
    runtime: DurableAgentRuntime,
    sessionId: string,
    origin: Origin,
    nativeCursor?: string,
    legacyCursor?: string,
    source?: Position['source'],
  ) {
    const queued = source === 'legacy' || nativeCursor ? [] : this.pending(sessionId);
    const queuedRequests = new Set(queued.map((turn) => turn.identity.requestId));
    for (const turn of queued.toReversed()) yield* turnRows(turn);
    if (source !== 'legacy') {
      let cursor = nativeCursor;
      do {
        const page = await runtime.history(sessionId, { limit: 64, ...(cursor ? { cursor } : {}) });
        for (const turn of page.turns)
          if (!queuedRequests.has(turn.identity.requestId)) yield* turnRows(turn);
        cursor = page.nextCursor;
      } while (cursor);
    }
    if (origin) {
      let cursor = legacyCursor;
      do {
        const page = await this.legacy.listByCursor(
          origin.sourceSessionId,
          { limit: 128, ...(cursor ? { cursor } : {}) },
          origin.throughMessageId,
        );
        for (const message of page.items) yield legacyRow(sessionId, message);
        cursor = page.nextCursor;
      } while (cursor);
    }
  }

  private async enrich(messages: AgentMessageView[]) {
    // Settled timing includes approval waits that only the app observed.
    const timings = await this.store.getDurableRuntimeTimings(
      messages.filter((message) => message.role === 'assistant').map((message) => message.id),
    );
    return Promise.all(
      messages.map(async (message) => {
        if (message.role !== 'assistant') return message;
        const runtimeTiming = timings.get(message.id);
        const ledger = this.messageStats ? await this.messageStats(message.id) : undefined;
        if (!runtimeTiming && !ledger) return message;
        return {
          ...message,
          stats: { ...message.stats, ...ledger, ...(runtimeTiming ? { runtimeTiming } : {}) },
        };
      }),
    );
  }

  private async page(
    rows: readonly Row[],
    hasOlder: boolean,
    hasNewer: boolean,
  ): Promise<AgentSessionMessagePage> {
    const head = rows[0];
    const tail = rows.at(-1);
    return {
      items: await this.enrich(rows.map((row) => row.message)),
      ...(hasOlder && tail ? { nextCursor: encodePosition(tail.position) } : {}),
      ...(hasNewer && head ? { previousCursor: encodePosition(head.position) } : {}),
    };
  }
}

function turnRows(turn: RuntimeDurableTurn): Row[] {
  const projected = projectDurableHostTurn(turn);
  return [projected.assistant, projected.user].flatMap((message) =>
    message
      ? [
          {
            message,
            position: {
              sessionId: turn.identity.sessionId,
              id: message.id,
              source: turn.inputBoundary ? 'native' : 'pending',
              ...(turn.inputBoundary ? { boundary: turn.inputBoundary } : {}),
            } as Position,
          },
        ]
      : [],
  );
}
function legacyRow(sessionId: string, message: AgentMessageView): Row {
  return {
    message: { ...message, sessionId },
    position: {
      sessionId,
      id: message.id,
      source: 'legacy',
      boundary: `${Date.parse(message.createdAt)}:${message.id}`,
    },
  };
}
function encodePosition(position: Position) {
  return `${CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(position))}`;
}
function decodePosition(cursor: string | undefined, sessionId: string): Position | null {
  if (!cursor?.startsWith(CURSOR_PREFIX)) return null;
  try {
    const position = PositionSchema.parse(
      JSON.parse(decodeURIComponent(cursor.slice(CURSOR_PREFIX.length))),
    );
    return position.sessionId === sessionId ? position : null;
  } catch {
    return null;
  }
}
