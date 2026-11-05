import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createSqliteStoreHarness } from './_sqliteStoreHarness';

test('a committed claim is visible to a new SQLite connection before graceful close', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-persistence-'));
  const path = join(directory, 'cherry.db');
  const harness = createSqliteStoreHarness(path);
  try {
    const agentId = harness.seedAgent();
    const session = await harness.createEmptySession({ agentId });
    harness.raw
      .prepare(
        "INSERT INTO agent_session_message (id, session_id, turn_id, role, data, status, created_at, updated_at) VALUES ('answer', ?, 'turn', 'assistant', '{\"parts\":[]}', 'pending', 1, 1)",
      )
      .run(session.id);
    const execution = { sessionId: session.id, assistantMessageId: 'answer', turnId: 'turn' };
    expect(await harness.store.claimRecovery({ ...execution, processId: 'first' })).toEqual({
      kind: 'admit',
      admissions: 1,
    });
    const reopened = new DatabaseSync(path);
    try {
      expect(
        reopened
          .prepare(
            'SELECT recovery_admissions, recovery_state, last_recovery_process_id FROM agent_session_message WHERE id = ?',
          )
          .get('answer'),
      ).toEqual({
        recovery_admissions: 1,
        recovery_state: 'eligible',
        last_recovery_process_id: 'first',
      });
    } finally {
      reopened.close();
    }
  } finally {
    harness.cleanup();
    rmSync(directory, { recursive: true, force: true });
  }
});
