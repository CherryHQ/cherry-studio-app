import { sql, type SQL } from 'drizzle-orm';

import type { Database } from '@/backend/data/db/DbService';

/** Parent order remains stable when a queued input overtakes an earlier reservation. */
export function messageTreeDepthsSql(sessionId: string): SQL {
  // Walk each edge once, rather than walking every message's ancestors separately.
  return sql`WITH RECURSIVE tree_depth(id, depth) AS (
    SELECT root.id, 0 FROM agent_session_message AS root
    WHERE root.session_id = ${sessionId} AND root.parent_id IS NULL
    UNION ALL
    SELECT child.id, tree_depth.depth + 1 FROM agent_session_message AS child
    JOIN tree_depth ON child.parent_id = tree_depth.id
  ) SELECT id, depth FROM tree_depth`;
}

/** One reusable relation for ordering rows and resolving cursor/anchor positions. */
export function messageTreeOrder(db: Pick<Database, '$with' | 'select'>, sessionId: string) {
  return db.$with('message_order').as(
    db
      .select({
        id: sql<string>`ordered.id`.as('message_order_id'),
        depth: sql<number>`ordered.depth`.as('message_order_depth'),
      })
      .from(sql`(${messageTreeDepthsSql(sessionId)}) AS ordered`),
  );
}

/**
 * SQL fragments over the Agent message tree (docs/references/agent/agent-persistence.md).
 * Every reader of a Session's visible or model-facing history walks `parent_id`
 * upward from one leaf; tables are aliased so the fragments nest inside Drizzle
 * queries over `agent_session_message` without shadowing the outer row.
 */

/** The Session's selected leaf. */
export function activeNodeIdSql(sessionId: string): SQL {
  return sql`(SELECT tree_session.active_node_id FROM agent_session AS tree_session
    WHERE tree_session.id = ${sessionId})`;
}

/**
 * `SELECT id` of the ancestor chain ending at `node`, the node included. A
 * `null` node selects nothing; omit it to use the Session's selected leaf.
 */
export function messagePathIdsSql(sessionId: string, node?: string | null): SQL {
  if (node === null) return sql`SELECT NULL WHERE 0`;
  const leaf = node === undefined ? activeNodeIdSql(sessionId) : sql`${node}`;
  return sql`WITH RECURSIVE tree_path(id, parent_id) AS (
      SELECT tree_leaf.id, tree_leaf.parent_id FROM agent_session_message AS tree_leaf
      WHERE tree_leaf.session_id = ${sessionId} AND tree_leaf.id = ${leaf}
      UNION ALL
      SELECT tree_parent.id, tree_parent.parent_id FROM agent_session_message AS tree_parent
      JOIN tree_path ON tree_parent.id = tree_path.parent_id
    )
    SELECT id FROM tree_path`;
}

/**
 * `SELECT id` of the newest leaf below `messageId`, the message itself when it
 * has no children. Branch navigation lands there, as on Desktop.
 */
export function newestLeafIdSql(sessionId: string, messageId: string): SQL {
  return sql`WITH RECURSIVE tree_subtree(id) AS (
      SELECT tree_root.id FROM agent_session_message AS tree_root
      WHERE tree_root.session_id = ${sessionId} AND tree_root.id = ${messageId}
      UNION ALL
      SELECT tree_child.id FROM agent_session_message AS tree_child
      JOIN tree_subtree ON tree_child.parent_id = tree_subtree.id
    )
    SELECT tree_node.id FROM agent_session_message AS tree_node
    JOIN tree_subtree ON tree_node.id = tree_subtree.id
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_session_message AS tree_next WHERE tree_next.parent_id = tree_node.id
    )
    ORDER BY tree_node.created_at DESC, tree_node.id DESC
    LIMIT 1`;
}

/** `SELECT id` of the Session's newest leaf, used when no branch is selected. */
export function sessionNewestLeafIdSql(sessionId: string): SQL {
  return sql`SELECT tree_node.id FROM agent_session_message AS tree_node
    WHERE tree_node.session_id = ${sessionId}
      AND NOT EXISTS (
        SELECT 1 FROM agent_session_message AS tree_next WHERE tree_next.parent_id = tree_node.id
      )
    ORDER BY tree_node.created_at DESC, tree_node.id DESC
    LIMIT 1`;
}
