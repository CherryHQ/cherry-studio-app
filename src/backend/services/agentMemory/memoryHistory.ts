import type { MemoryExtractionRange, MemoryScope, MemorySourceMessage } from '@cherrystudio/memory';
import { MemoryError } from '@cherrystudio/memory';

import type { DbService } from '@/backend/data/db/DbService';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { type MemoryCaller, memoryRuntimeKey } from './memoryAuthority';

type HistoryRow = {
  id: string;
  session_id: string;
  parent_id: string | null;
  role: string;
  data: string;
  status: string;
  created_at: number;
  updated_at: number;
  searchable_text: string;
  siblings_group_id: number;
};
const version = (row: HistoryRow) =>
  sha256HexOfText(JSON.stringify([row.id, row.parent_id, row.data, row.status, row.updated_at]));
function body(row: HistoryRow): string {
  const data: unknown = JSON.parse(row.data);
  if (!data || typeof data !== 'object' || !('parts' in data) || !Array.isArray(data.parts))
    return '';
  return data.parts
    .flatMap((part) =>
      part && part.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
    )
    .join('\n');
}

/** Reads only persisted product messages; native working copies are never factual evidence. */
export class MemoryHistory {
  constructor(private readonly db: DbService) {}

  completedRange(
    agentId: string,
    replyId: string,
    boundary: number,
  ): MemoryExtractionRange | undefined {
    const sqlite = this.db.getSqlite();
    const reply = sqlite.getFirstSync<HistoryRow>(
      'SELECT m.* FROM agent_session_message m JOIN agent_session s ON s.id = m.session_id JOIN agent a ON a.id = s.agent_id WHERE m.id = ? AND s.agent_id = ? AND a.deleted_at IS NULL AND a.shared_memory_enabled = 1',
      replyId,
      agentId,
    );
    if (
      !reply ||
      reply.role !== 'assistant' ||
      reply.status !== 'success' ||
      reply.siblings_group_id !== 0 ||
      reply.created_at < boundary ||
      !reply.parent_id ||
      !this.onBranch(reply.session_id, reply.id)
    )
      return;
    const question = sqlite.getFirstSync<HistoryRow>(
      'SELECT * FROM agent_session_message WHERE id = ? AND session_id = ?',
      reply.parent_id,
      reply.session_id,
    );
    if (
      !question ||
      question.role !== 'user' ||
      question.status !== 'success' ||
      question.created_at < boundary
    )
      return;
    const rows: HistoryRow[] = [reply, question];
    let parent = question.parent_id;
    let bytes = new TextEncoder().encode(body(reply) + body(question)).length;
    if (
      bytes > 32_000 ||
      [reply, question].some((row) => new TextEncoder().encode(body(row)).length > 8_000)
    )
      return;
    const seen = new Set(rows.map((row) => row.id));
    while (parent && rows.length < 16) {
      if (seen.has(parent))
        throw new MemoryError('conflict', 'Conversation branch contains a cycle');
      const row = sqlite.getFirstSync<HistoryRow>(
        'SELECT * FROM agent_session_message WHERE id = ? AND session_id = ?',
        parent,
        reply.session_id,
      );
      if (
        !row ||
        row.created_at < boundary ||
        row.status !== 'success' ||
        !['user', 'assistant'].includes(row.role)
      )
        break;
      const size = new TextEncoder().encode(body(row)).length;
      if (size > 8_000 || bytes + size > 32_000) break;
      rows.push(row);
      seen.add(row.id);
      bytes += size;
      parent = row.parent_id;
    }
    rows.reverse();
    while (rows[0]?.role !== 'user') rows.shift();
    const messages: MemorySourceMessage[] = rows.map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      text: body(row),
      createdAt: row.created_at,
      version: version(row),
    }));
    return {
      messages,
      hash: sha256HexOfText(JSON.stringify(messages)),
      leftContextIncomplete: Boolean(parent),
    };
  }

  async search(
    caller: MemoryCaller,
    input: { query?: string; conversationId?: string; messageId?: string },
    allowConversation: (id: string) => Promise<boolean>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const sqlite = this.db.getSqlite();
    let rows: HistoryRow[];
    if (input.messageId && input.conversationId) {
      rows = sqlite.getAllSync<HistoryRow>(
        "SELECT m.* FROM agent_session_message m JOIN agent_session s ON s.id = m.session_id WHERE m.id = ? AND m.session_id = ? AND s.agent_id = ? AND m.status = 'success' AND m.role IN ('user','assistant')",
        input.messageId,
        input.conversationId,
        caller.agentId,
      );
    } else {
      const terms = (input.query ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 16);
      if (!terms.length) return { hits: [], excerpts: [], truncated: false };
      const longOnly = terms.every((term) => Array.from(term).length >= 3);
      const match = longOnly
        ? 'm.fts_rowid IN (SELECT rowid FROM agent_session_message_fts WHERE searchable_text MATCH ?)'
        : '(' + terms.map(() => "m.searchable_text LIKE ? ESCAPE '\\'").join(' OR ') + ')';
      const parameters = longOnly
        ? [terms.map((term) => '"' + term.replaceAll('"', '""') + '"').join(' OR ')]
        : terms.map((term) => '%' + term.replace(/[\\%_]/g, '\\$&') + '%');
      rows = sqlite.getAllSync<HistoryRow>(
        "SELECT m.* FROM agent_session_message m JOIN agent_session s ON s.id = m.session_id WHERE s.agent_id = ? AND m.status = 'success' AND m.role = 'user' AND " +
          match +
          ' ORDER BY m.created_at DESC LIMIT 64',
        caller.agentId,
        ...parameters,
      );
      const rank = (row: HistoryRow) =>
        terms.filter((term) => row.searchable_text.toLowerCase().includes(term.toLowerCase()))
          .length;
      rows.sort(
        (a, b) =>
          rank(b) - rank(a) ||
          a.searchable_text.length - b.searchable_text.length ||
          b.created_at - a.created_at,
      );
    }
    const hits: HistoryRow[] = [];
    for (const row of rows) {
      signal.throwIfAborted();
      if (
        row.id === caller.userMessageId ||
        !this.onBranch(row.session_id, row.id) ||
        !(await allowConversation(row.session_id))
      )
        continue;
      hits.push(row);
      if (hits.length === 6) break;
    }
    const excerpts = new Map<string, HistoryRow>();
    if (hits[0]) {
      const branch = this.branchIds(hits[0].session_id);
      const index = branch.indexOf(hits[0].id);
      const ids = [
        ...new Set([
          ...branch.slice(0, 3),
          ...branch.slice(-3),
          ...branch.slice(Math.max(0, index - 5), index + 6),
        ]),
      ];
      for (const id of ids) {
        if (id === caller.userMessageId) continue;
        const row = sqlite.getFirstSync<HistoryRow>(
          'SELECT * FROM agent_session_message WHERE id = ? AND session_id = ?',
          id,
          hits[0].session_id,
        );
        if (row?.status === 'success' && ['user', 'assistant'].includes(row.role))
          excerpts.set(row.id, row);
      }
    }
    for (const row of hits) excerpts.set(row.id, row);
    const format = (row: HistoryRow) => ({
      messageId: row.id,
      conversationId: row.session_id,
      role: row.role,
      createdAt: row.created_at,
      text: body(row).slice(0, 2000),
      truncated: body(row).length > 2000,
    });
    for (const row of excerpts.values()) {
      const current = sqlite.getFirstSync<HistoryRow>(
        'SELECT * FROM agent_session_message WHERE id = ?',
        row.id,
      );
      if (
        !current ||
        version(current) !== version(row) ||
        !this.onBranch(row.session_id, row.id) ||
        !(await allowConversation(row.session_id))
      )
        throw new MemoryError('conflict', 'Historical evidence changed during retrieval');
    }
    signal.throwIfAborted();
    return {
      hits: hits.map(format),
      excerpts: [...excerpts.values()].slice(0, 22).map(format),
      truncated: rows.length === 64 || excerpts.size > 22,
    };
  }

  matchesProtection(sessionId: string, scope: MemoryScope, protection: string | null): boolean {
    if (!protection) return true;
    const row = this.db
      .getSqlite()
      .getFirstSync<{ value: string }>(
        'SELECT value FROM app_state WHERE key = ?',
        memoryRuntimeKey(sessionId, scope),
      );
    if (!row) return false;
    const state: unknown = JSON.parse(row.value);
    return Boolean(
      state &&
      typeof state === 'object' &&
      'version' in state &&
      state.version === 1 &&
      'protection' in state &&
      state.protection === protection,
    );
  }

  private branchIds(sessionId: string): string[] {
    return this.db
      .getSqlite()
      .getAllSync<{ id: string; depth: number }>(
        'WITH RECURSIVE path(id,parent_id,depth) AS (SELECT m.id,m.parent_id,0 FROM agent_session s JOIN agent_session_message m ON m.id = s.active_node_id WHERE s.id = ? UNION ALL SELECT m.id,m.parent_id,p.depth+1 FROM agent_session_message m JOIN path p ON m.id = p.parent_id WHERE m.session_id = ? AND p.depth < 100000) SELECT id,depth FROM path ORDER BY depth DESC',
        sessionId,
        sessionId,
      )
      .map((row) => row.id);
  }
  private onBranch(sessionId: string, messageId: string): boolean {
    return Boolean(
      this.db
        .getSqlite()
        .getFirstSync(
          'WITH RECURSIVE path(id,parent_id) AS (SELECT m.id,m.parent_id FROM agent_session s JOIN agent_session_message m ON m.id = s.active_node_id WHERE s.id = ? UNION SELECT m.id,m.parent_id FROM agent_session_message m JOIN path p ON m.id = p.parent_id WHERE m.session_id = ?) SELECT id FROM path WHERE id = ? LIMIT 1',
          sessionId,
          sessionId,
          messageId,
        ),
    );
  }
}
