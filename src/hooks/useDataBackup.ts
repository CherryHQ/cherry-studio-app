import { eq } from 'drizzle-orm'
import { useLiveQuery } from 'drizzle-orm/expo-sqlite'

import { db } from '../../db'
import { transformDbToDataBackupProvider, upsertDataBackupProviders } from '../../db/queries/backup.queries'
import { backup_providers } from '../../db/schema'

export function useDataBackupProvider(providerId: string) {
  console.log('useDataBackupProvider', providerId)
  const query = db.select().from(backup_providers).where(eq(backup_providers.id, providerId))
  const { data: rawProviders, updatedAt } = useLiveQuery(query)

  if (!updatedAt) {
    return {
      provider: null,
      isLoading: true,
      updateProvider: async () => {}
    }
  }

  const rawProvider = rawProviders && rawProviders.length > 0 ? rawProviders[0] : null
  const provider = rawProvider ? transformDbToDataBackupProvider(rawProvider) : null

  const updateProvider = async updatedProvider => {
    await upsertDataBackupProviders([updatedProvider])
  }

  return {
    provider,
    isLoading: false,
    updateProvider
  }
}
