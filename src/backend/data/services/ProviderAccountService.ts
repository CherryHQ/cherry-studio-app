import { and, eq } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { userProviderTable } from '@/backend/data/db/schemas';
import { ProviderAccountError } from '@/shared/contracts';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

/** Updates account-owned keys without overwriting concurrent edits to manual keys. */
export class ProviderAccountService {
  constructor(private readonly db: DbService) {}

  async get(providerId: string) {
    const [row] = await this.db
      .getDb()
      .select()
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, providerId))
      .limit(1);
    if (!row) throw new ProviderAccountError('configuration');
    return {
      id: row.providerId,
      presetProviderId: row.presetProviderId ?? undefined,
      name: row.name,
      createdAt: row.createdAt,
    };
  }

  async replaceKeys(
    providerId: string,
    createdAt: number,
    previousKeys: ApiKeyEntry[],
    nextKeys: ApiKeyEntry[],
  ) {
    return this.db.withWriteTx(async (tx) => {
      const identity = and(
        eq(userProviderTable.providerId, providerId),
        eq(userProviderTable.createdAt, createdAt),
      );
      const [row] = await tx.select().from(userProviderTable).where(identity).limit(1);
      if (!row) return false;
      const keys = (row.apiKeys ?? []).filter(
        (key) =>
          !previousKeys.some((previous) => previous.id === key.id && previous.key === key.key),
      );
      for (const key of nextKeys) {
        if (!keys.some((existing) => existing.key === key.key || existing.id === key.id))
          keys.push(key);
      }
      await tx.update(userProviderTable).set({ apiKeys: keys }).where(identity);
      return true;
    });
  }
}
