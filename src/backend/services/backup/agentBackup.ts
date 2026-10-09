import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { AgentSqlDatabase } from '@/backend/data/db/AgentSqlDatabase';
import { withBackupDatabase } from '@/backend/data/db/backupDatabase';
import { BackupError } from '@/shared/contracts/backup';

type SqlPort = Pick<AgentSqlDatabase, 'exec' | 'run' | 'get' | 'all' | 'transaction' | 'close'>;
export type AgentBackupPort = {
  schema: { runtimeVersion: string; schemaVersion: number; migrations: string };
  quiesce(): Promise<void>;
  capture(destinationUri: string): Promise<void>;
  validate(
    database: SqlPort,
    reference: SqlPort,
  ): Promise<{
    messages: number;
    sessions: readonly {
      sessionId: string;
      agentId: string;
      committed: boolean;
      legacy: { sourceSessionId: string; throughMessageId: string } | null;
      fileEntryIds: readonly string[];
    }[];
  }>;
};
export type AgentBackupVersion = {
  runtime: 'pi-durable';
  runtimeVersion: string;
  schemaVersion: number;
  migrationsSha256: string;
};

export async function agentBackupVersion(port: AgentBackupPort): Promise<AgentBackupVersion> {
  return {
    runtime: 'pi-durable',
    runtimeVersion: port.schema.runtimeVersion,
    schemaVersion: port.schema.schemaVersion,
    migrationsSha256: await digestStringAsync(CryptoDigestAlgorithm.SHA256, port.schema.migrations),
  };
}

export async function validateAgentBackup(
  file: File,
  version: AgentBackupVersion,
  port: AgentBackupPort,
) {
  const expected = await agentBackupVersion(port);
  // The package version is informational: a Pi upgrade with unchanged storage restores old backups.
  if (
    (['runtime', 'schemaVersion', 'migrationsSha256'] as const).some(
      (key) => expected[key] !== version[key],
    )
  )
    throw new BackupError('incompatible', 'The Pi storage version is incompatible.');
  const directory = new Directory(Paths.cache, `pi-backup-schema-${randomUUID()}`);
  directory.create();
  let database: AgentSqlDatabase | undefined;
  let reference: AgentSqlDatabase | undefined;
  try {
    database = await AgentSqlDatabase.open({
      directory: file.parentDirectory.uri,
      name: file.name,
      journal: 'preserve',
    });
    reference = await AgentSqlDatabase.open({
      directory: directory.uri,
      name: 'reference.db',
      journal: 'preserve',
    });
    const result = await port.validate(database, reference);
    await withBackupDatabase(new File(file.parentDirectory, 'cherry.db'), async (cherry) => {
      for (const session of result.sessions) {
        const business = await cherry.getFirstAsync<{ agentId: string }>(
          'SELECT agent_id AS agentId FROM agent_session WHERE id = ?',
          session.sessionId,
        );
        if ((session.committed && !business) || (business && business.agentId !== session.agentId))
          throw new BackupError('invalid', 'The Pi and Cherry session owners are inconsistent.');
        if (
          session.legacy &&
          !(await cherry.getFirstAsync(
            'SELECT id FROM agent_session_message WHERE id = ? AND session_id = ?',
            session.legacy.throughMessageId,
            session.legacy.sourceSessionId,
          ))
        )
          throw new BackupError(
            'invalid',
            'The Pi legacy boundary has no matching Cherry history.',
          );
        for (const id of session.fileEntryIds)
          if (!(await cherry.getFirstAsync('SELECT id FROM file_entry WHERE id = ?', id)))
            throw new BackupError('invalid', 'A Pi file grant has no matching managed resource.');
      }
    });
    return result;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(
      'invalid',
      error instanceof Error ? error.message : 'The Pi snapshot is invalid.',
    );
  } finally {
    try {
      await database?.close();
    } finally {
      await reference?.close();
      if (directory.exists) directory.delete();
    }
  }
}
