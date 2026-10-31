import { eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { DbService } from '@/backend/data/db/DbService';
import { sshProfileTable, type SshProfileRow } from '@/backend/data/db/schemas';
import { SshError, type SshProfile, type SshReference } from '@/shared/data/types/ssh';

export function toSshProfile(row: SshProfileRow): SshProfile {
  const { id, revision, name, host, port, username, authMethod, fingerprint } = row;
  return { id, revision, name, host, port, username, authMethod, fingerprint };
}

export class SshProfileService {
  constructor(private readonly database?: DbService) {}
  private get dbService() {
    return this.database ?? application.get('DbService');
  }

  async list(): Promise<SshProfile[]> {
    return (
      await this.dbService.getDb().select().from(sshProfileTable).orderBy(sshProfileTable.name)
    ).map(toSshProfile);
  }

  async getRow(reference: SshReference): Promise<SshProfileRow> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(sshProfileTable)
      .where(eq(sshProfileTable.id, reference.id));
    if (!row || row.revision !== reference.revision) throw new SshError('changed');
    return row;
  }

  async save(
    input: Omit<SshProfileRow, 'id' | 'createdAt' | 'updatedAt'>,
    previous?: SshReference,
  ) {
    return this.dbService.withWriteTx(async (tx) => {
      if (previous) {
        const [current] = await tx
          .select()
          .from(sshProfileTable)
          .where(eq(sshProfileTable.id, previous.id));
        if (current?.revision !== previous.revision) throw new SshError('changed');
      }
      const [row] = previous
        ? await tx
            .update(sshProfileTable)
            .set(input)
            .where(eq(sshProfileTable.id, previous.id))
            .returning()
        : await tx.insert(sshProfileTable).values(input).returning();
      return toSshProfile(row);
    });
  }

  async remove(reference: SshReference) {
    return this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(sshProfileTable)
        .where(eq(sshProfileTable.id, reference.id));
      if (row?.revision !== reference.revision) throw new SshError('changed');
      await tx.delete(sshProfileTable).where(eq(sshProfileTable.id, reference.id));
    });
  }
}
export const sshProfileService = new SshProfileService();
