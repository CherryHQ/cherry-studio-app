import { db } from '../index'
import { backup_providers } from '../schema'

export function transformDbToDataBackupProvider(dbRecord: any) {
  if (!dbRecord) return null
  const config = typeof dbRecord.config === 'string' ? JSON.parse(dbRecord.config) : dbRecord.config

  if (dbRecord.id === 'webdav') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      webdavHost: config.webdavHost,
      webdavUser: config.webdavUser,
      webdavPass: config.webdavPass,
      webdavPath: config.webdavPath
    }
  }

  if (dbRecord.id === 'nutstore') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      nutstoreToken: config.nutstoreToken,
      nutstorePath: config.nutstorePath,
      nutstoreAutoSync: config.nutstoreAutoSync,
      nutstoreSyncInterval: config.nutstoreSyncInterval,
      nutstoreSyncState: config.nutstoreSyncState
    }
  }

  if (dbRecord.id === 'notion') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      notionDatabaseID: config.notionDatabaseID,
      notionApiKey: config.notionApiKey,
      notionPageNameKey: config.notionPageNameKey,
      notionExportReasoning: config.notionExportReasoning
    }
  }

  if (dbRecord.id === 'yuque') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      yuqueToken: config.yuqueToken,
      yuqueUrl: config.yuqueUrl,
      yuqueRepoId: config.yuqueRepoId
    }
  }

  if (dbRecord.id === 'joplin') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      joplinToken: config.joplinToken,
      joplinUrl: config.joplinUrl,
      joplinExportReasoning: config.joplinExportReasoning
    }
  }

  if (dbRecord.id === 'siyuan') {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      siyuanApiUrl: config.siyuanApiUrl,
      siyuanToken: config.siyuanToken,
      siyuanBoxId: config.siyuanBoxId,
      siyuanRootPath: config.siyuanRootPath
    }
  }
}

export async function upsertDataBackupProviders(providersToUpsert: any[]) {
  try {
    const dbRecords = providersToUpsert.map(provider => {
      const { id, name, ...configProps } = provider
      return {
        id,
        name,
        config: JSON.stringify(configProps)
      }
    })

    const upsertPromises = dbRecords.map(record => {
      return db
        .insert(backup_providers)
        .values(record)
        .onConflictDoUpdate({
          target: [backup_providers.id],
          set: record
        })
    })

    return await Promise.all(upsertPromises)
  } catch (error) {
    console.error('Error upserting backup providers:', error)
    throw error
  }
}
