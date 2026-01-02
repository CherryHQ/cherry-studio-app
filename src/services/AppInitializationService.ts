import { assistantDatabase, mcpDatabase, providerDatabase, topicDatabase, websearchProviderDatabase } from '@database'
import { db } from '@db'
import { seedDatabase } from '@db/seeding'
import * as Localization from 'expo-localization'

import { getSystemAssistants } from '@/config/assistants'
import { initBuiltinMcp } from '@/config/mcp'
import { SYSTEM_PROVIDERS, SYSTEM_PROVIDERS_CONFIG } from '@/config/providers'
import { getWebSearchProviders } from '@/config/websearchProviders'
import { storage } from '@/utils'

import { assistantService, getDefaultAssistant } from './AssistantService'
import { loggerService } from './LoggerService'
import { mcpService } from './McpService'
import { preferenceService } from './PreferenceService'
import { providerService } from './ProviderService'
import { topicService } from './TopicService'

type AppDataMigration = {
  version: number
  app_version: string
  description: string
  migrate: () => Promise<void>
}

const logger = loggerService.withContext('AppInitializationService')

const APP_DATA_MIGRATIONS: AppDataMigration[] = [
  {
    version: 1,
    app_version: '0.1.0',
    description: 'Initial app data seeding',
    migrate: async () => {
      await seedDatabase(db)

      // Use direct database access for initial seeding (performance)
      // AssistantService cache will be built naturally as the app is used
      const systemAssistants = getSystemAssistants()
      await assistantDatabase.upsertAssistants(systemAssistants)

      await providerDatabase.upsertProviders(SYSTEM_PROVIDERS)

      const websearchProviders = getWebSearchProviders()
      await websearchProviderDatabase.upsertWebSearchProviders(websearchProviders)

      const locales = Localization.getLocales()
      if (locales.length > 0) {
        storage.set('language', locales[0]?.languageTag)
      }

      const builtinMcp = initBuiltinMcp()
      await mcpDatabase.upsertMcps(builtinMcp)
    }
  },
  {
    version: 2,
    app_version: '0.1.3',
    description: 'Sync built-in MCP servers (add @cherry/shortcuts)',
    migrate: async () => {
      // Get existing MCP servers from database
      const existingMcps = await mcpDatabase.getMcps()
      const existingIds = new Set(existingMcps.map(mcp => mcp.id))

      // Get all built-in MCP servers
      const builtinMcp = initBuiltinMcp()

      // Filter to only add new MCP servers that don't exist yet
      const newMcps = builtinMcp.filter(mcp => !existingIds.has(mcp.id))

      if (newMcps.length > 0) {
        await mcpDatabase.upsertMcps(newMcps)
        logger.info(`Added ${newMcps.length} new built-in MCP server(s): ${newMcps.map(m => m.id).join(', ')}`)
      } else {
        logger.info('No new built-in MCP servers to add')
      }
    }
  },
  {
    version: 3,
    app_version: '0.1.4',
    description: 'Update AI Gateway host to new endpoint',
    migrate: async () => {
      const aiGatewayProvider = await providerDatabase.getProviderById('ai-gateway')
      const desiredHost = SYSTEM_PROVIDERS_CONFIG['ai-gateway']?.apiHost

      if (!desiredHost) {
        logger.warn('AI Gateway provider configuration missing desired host; skipping migration')
        return
      }

      if (!aiGatewayProvider) {
        logger.info('AI Gateway provider not found in database; skipping host update')
        return
      }

      if (aiGatewayProvider.apiHost === desiredHost) {
        logger.info('AI Gateway provider already uses the updated host')
        return
      }

      await providerDatabase.upsertProviders([
        {
          ...aiGatewayProvider,
          apiHost: desiredHost
        }
      ])

      logger.info(`AI Gateway provider host updated to ${desiredHost}`)
    }
  }
]

const LATEST_APP_DATA_VERSION = APP_DATA_MIGRATIONS[APP_DATA_MIGRATIONS.length - 1]?.version ?? 0

export function resetAppInitializationState(): void {
  preferenceService.clearCache()
  assistantService.clearCache()
  providerService.clearCache()
  topicService.resetState()
  mcpService.invalidateCache()
  logger.info('App initialization state reset')
}

async function ensureCurrentTopic(): Promise<void> {
  const currentTopicId = await preferenceService.get('topic.current_id')

  // If current topic is set and valid, nothing to do
  if (currentTopicId) {
    const topic = await topicDatabase.getTopicById(currentTopicId)
    if (topic) {
      return
    }
    logger.warn(`Current topic ${currentTopicId} not found, selecting new topic`)
  }

  // Try to get newest existing topic
  const newestTopic = await topicDatabase.getNewestTopic()
  if (newestTopic) {
    await preferenceService.set('topic.current_id', newestTopic.id)
    logger.info(`Set current topic to newest: ${newestTopic.id}`)
    return
  }

  // No topics exist - create one with default assistant
  const defaultAssistant = await getDefaultAssistant()
  if (defaultAssistant) {
    const newTopic = await topicService.createTopic(defaultAssistant)
    await preferenceService.set('topic.current_id', newTopic.id)
    logger.info(`Created new topic: ${newTopic.id}`)
  }
}

export async function runAppDataMigrations(): Promise<void> {
  const currentVersion = await preferenceService.get('app.initialization_version')

  if (currentVersion >= LATEST_APP_DATA_VERSION) {
    logger.info(`App data already up to date at version ${currentVersion}`)

    // Initialize ProviderService cache (loads default provider)
    await providerService.initialize()

    // Ensure a valid current topic exists
    await ensureCurrentTopic()

    return
  }

  const pendingMigrations = APP_DATA_MIGRATIONS.filter(migration => migration.version > currentVersion).sort(
    (a, b) => a.version - b.version
  )

  logger.info(
    `Preparing to run ${pendingMigrations.length} app data migration(s) from version ${currentVersion} to ${LATEST_APP_DATA_VERSION}`
  )

  for (const migration of pendingMigrations) {
    logger.info(`Running app data migration v${migration.version}: ${migration.description}`)

    try {
      await migration.migrate()
      await preferenceService.set('app.initialization_version', migration.version)
      logger.info(`Completed app data migration v${migration.version}`)
    } catch (error) {
      logger.error(`App data migration v${migration.version} failed`, error as Error)
      throw error
    }
  }

  logger.info(`App data migrations completed. Current version: ${LATEST_APP_DATA_VERSION}`)

  // Initialize ProviderService cache (loads default provider)
  await providerService.initialize()

  // Ensure a valid current topic exists
  await ensureCurrentTopic()
}

export function getAppDataVersion(): number {
  return LATEST_APP_DATA_VERSION
}
