import { Dispatch } from '@reduxjs/toolkit'
import { Directory, File, Paths } from 'expo-file-system'
import dayjs from 'dayjs'
import { unzip, zip } from 'react-native-zip-archive'

import { DEFAULT_BACKUP_STORAGE, DEFAULT_DOCUMENTS_STORAGE } from '@/constants/storage'
import { getSystemAssistants } from '@/config/assistants'
import { loggerService } from '@/services/LoggerService'
import { preferenceService } from '@/services/PreferenceService'
import { Assistant, Topic } from '@/types/assistant'
import { ExportIndexedData, ExportReduxData, ImportIndexedData, ImportReduxData, Setting } from '@/types/databackup'
import { FileMetadata } from '@/types/file'
import { Message } from '@/types/message'

import {
  assistantDatabase,
  messageBlockDatabase,
  messageDatabase,
  providerDatabase,
  topicDatabase,
  websearchProviderDatabase
} from '@database'
import { assistantService } from './AssistantService'
import { providerService } from './ProviderService'
import { topicService } from './TopicService'
const logger = loggerService.withContext('Backup Service')

export type RestoreStepId = 'restore_settings' | 'restore_messages'

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'error'

export type ProgressUpdate = {
  step: RestoreStepId
  status: StepStatus
  error?: string
}

type OnProgressCallback = (update: ProgressUpdate) => void

async function restoreIndexedDbData(data: ExportIndexedData, onProgress: OnProgressCallback, _dispatch: Dispatch) {
  onProgress({ step: 'restore_messages', status: 'in_progress' })

  // 根据数据量动态调整批次大小
  const topicCount = data.topics.length
  const messageCount = data.messages.length
  const blockCount = data.message_blocks.length

  // 数据量越大，批次越小，避免单次操作占用太多内存
  const BATCH_SIZE = messageCount > 10000 ? 20 : messageCount > 1000 ? 50 : 100

  logger.info(`Processing ${topicCount} topics, ${messageCount} messages, ${blockCount} blocks`)
  logger.info(`Using batch size: ${BATCH_SIZE}`)

  // 获取数据库中现有的 assistant IDs，用于验证 topics
  const existingAssistants = await assistantDatabase.getAllAssistants()
  const existingAssistantIds = new Set(existingAssistants.map(a => a.id))

  // 检查并修复 topics 中的无效 assistantId
  const topicAssistantIds = new Set(data.topics.map(t => t.assistantId))
  const missingTopicAssistantIds = [...topicAssistantIds].filter(id => !existingAssistantIds.has(id))

  if (missingTopicAssistantIds.length > 0) {
    const affectedTopicsCount = data.topics.filter(t => missingTopicAssistantIds.includes(t.assistantId)).length
    logger.warn(
      `Fixed ${affectedTopicsCount} topics with missing assistant_id by replacing with "default". Missing IDs: ${missingTopicAssistantIds.join(', ')}`
    )

    data.topics = data.topics.map(topic => {
      if (missingTopicAssistantIds.includes(topic.assistantId)) {
        return {
          ...topic,
          assistantId: 'default'
        }
      }
      return topic
    })
  }

  // 分批处理 topics
  for (let i = 0; i < topicCount; i += BATCH_SIZE) {
    const batch = data.topics.slice(i, Math.min(i + BATCH_SIZE, topicCount))
    await topicDatabase.upsertTopics(batch)

    if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= topicCount) {
      logger.info(`Topics: ${Math.min(i + BATCH_SIZE, topicCount)}/${topicCount}`)
    }
  }

  // 验证并修复 messages 中的外键引用
  const messageAssistantIds = new Set(data.messages.map(msg => msg.assistantId))
  const messageTopicIds = new Set(data.messages.map(msg => msg.topicId))
  const validTopicIds = new Set(data.topics.map(t => t.id))

  // 检查是否有 messages 引用了不存在的 assistantId
  const missingAssistantIds = [...messageAssistantIds].filter(id => !existingAssistantIds.has(id))
  if (missingAssistantIds.length > 0) {
    const affectedMessagesCount = data.messages.filter(msg => missingAssistantIds.includes(msg.assistantId)).length
    logger.warn(
      `Fixed ${affectedMessagesCount} messages with missing assistant_id by replacing with "default". Missing IDs: ${missingAssistantIds.join(', ')}`
    )

    data.messages = data.messages.map(msg => {
      if (missingAssistantIds.includes(msg.assistantId)) {
        return {
          ...msg,
          assistantId: 'default'
        }
      }
      return msg
    })
  }

  // 检查是否有 messages 引用了不存在的 topicId
  const missingTopicIds = [...messageTopicIds].filter(id => !validTopicIds.has(id))
  if (missingTopicIds.length > 0) {
    const originalCount = data.messages.length
    data.messages = data.messages.filter(msg => !missingTopicIds.includes(msg.topicId))
    const filteredCount = originalCount - data.messages.length

    if (filteredCount > 0) {
      logger.error(
        `Filtered out ${filteredCount} messages with invalid topic_id references. Missing topic IDs: ${missingTopicIds.join(', ')}`
      )
    }
  }

  // 分批处理 messages
  const finalMessageCount = data.messages.length
  for (let i = 0; i < finalMessageCount; i += BATCH_SIZE) {
    const batch = data.messages.slice(i, Math.min(i + BATCH_SIZE, finalMessageCount))
    await messageDatabase.upsertMessages(batch)

    if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= finalMessageCount) {
      logger.info(`Messages: ${Math.min(i + BATCH_SIZE, finalMessageCount)}/${finalMessageCount}`)
    }
  }

  // 分批过滤和处理 message_blocks
  logger.info('Processing message blocks...')
  const validMessageIds = new Set(data.messages.map(msg => msg.id))
  let filteredCount = 0
  let processedBlocks = 0

  for (let i = 0; i < blockCount; i += BATCH_SIZE) {
    const batch = data.message_blocks.slice(i, Math.min(i + BATCH_SIZE, blockCount))
    const validBlocks = batch.filter(block => {
      const isValid = validMessageIds.has(block.messageId)
      if (!isValid) filteredCount++
      return isValid
    })

    if (validBlocks.length > 0) {
      await messageBlockDatabase.upsertBlocks(validBlocks)
      processedBlocks += validBlocks.length
    }

    if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= blockCount) {
      logger.info(`Blocks: ${Math.min(i + BATCH_SIZE, blockCount)}/${blockCount} (valid: ${processedBlocks})`)
    }
  }

  if (filteredCount > 0) {
    logger.warn(`Filtered out ${filteredCount} message block(s) with invalid message_id references`)
  }

  // 清理 Set 对象
  validMessageIds.clear()

  // Invalidate caches after bulk import to ensure consistency
  topicService.invalidateCache()
  assistantService.invalidateCache()

  if (data.settings) {
    const avatarSetting = data.settings.find(setting => setting.id === 'image://avatar')

    if (avatarSetting) {
      await preferenceService.set('user.avatar', avatarSetting.value)
    }
  }

  logger.info('IndexedDB data restore completed')
  onProgress({ step: 'restore_messages', status: 'completed' })
}

async function restoreReduxData(data: ExportReduxData, onProgress: OnProgressCallback, _dispatch: Dispatch) {
  onProgress({ step: 'restore_settings', status: 'in_progress' })
  await providerDatabase.upsertProviders(data.llm.providers)
  providerService.invalidateCache()
  await providerService.refreshAllProvidersCache()
  const allSourceAssistants = [data.assistants.defaultAssistant, ...data.assistants.assistants]

  // default assistant为built_in, 其余为external
  const assistants = allSourceAssistants.map(
    (assistant, index) =>
      ({
        ...assistant,
        type: index === 0 ? 'system' : 'external'
      }) as Assistant
  )

  logger.info(`Restoring ${assistants.length} assistants`)
  await assistantDatabase.upsertAssistants(assistants)

  await websearchProviderDatabase.upsertWebSearchProviders(data.websearch.providers)
  await new Promise(resolve => setTimeout(resolve, 200)) // Delay between steps

  await preferenceService.set('user.name', data.settings.userName)
  onProgress({ step: 'restore_settings', status: 'completed' })
}

export async function restore(
  backupFile: Omit<FileMetadata, 'md5'>,
  onProgress: OnProgressCallback,
  dispatch: Dispatch
) {
  if (!DEFAULT_DOCUMENTS_STORAGE.exists) {
    DEFAULT_DOCUMENTS_STORAGE.create({ intermediates: true, overwrite: true })
  }

  let unzipPath: string | undefined

  try {
    const extractedDirPath = Paths.join(DEFAULT_DOCUMENTS_STORAGE, backupFile.name.replace('.zip', ''))
    logger.info('Unzipping backup file...')
    await unzip(backupFile.path, extractedDirPath)
    unzipPath = extractedDirPath

    const dataFile = new File(extractedDirPath, 'data.json')

    // TODO: 长期方案 - 重构备份格式为分文件存储，避免读取大 JSON 文件
    // 当前依赖 android:largeHeap="true" 来处理大文件（>100MB）
    logger.info('Starting to read backup file, size:', dataFile.size, 'bytes')
    let fileContent = await dataFile.text()

    logger.info('Parsing and transforming backup data...')
    let parsedData = transformBackupData(fileContent)

    // 立即释放原始文件内容
    // @ts-ignore - fileContent 不再需要
    fileContent = null

    logger.info('Restoring Redux data...')
    await restoreReduxData(parsedData.reduxData, onProgress, dispatch)

    // Redux 数据已写入，释放内存
    // @ts-ignore
    parsedData.reduxData = null

    logger.info('Restoring IndexedDB data...')
    await restoreIndexedDbData(parsedData.indexedData, onProgress, dispatch)

    // IndexedDB 数据已写入，释放内存
    // @ts-ignore
    parsedData.indexedData = null
    // @ts-ignore
    parsedData = null

    logger.info('Restore completed successfully')
  } catch (error) {
    logger.error('restore error: ', error)
    throw error
  } finally {
    if (unzipPath) {
      try {
        new Directory(unzipPath).delete()
      } catch (cleanupError) {
        logger.error('Failed to cleanup temporary directory: ', cleanupError)
      }
    }
  }
}

function transformBackupData(data: string): { reduxData: ExportReduxData; indexedData: ExportIndexedData } {
  let orginalData: any

  try {
    // 解析主 JSON - 这步无法避免，但可以立即释放原始字符串
    logger.info('Parsing main JSON structure...')
    orginalData = JSON.parse(data)
    // data 参数会在函数返回后自动释放
  } catch (error) {
    logger.error('Failed to parse backup JSON:', error)
    throw new Error('Invalid backup file format')
  }

  // 提取 Redux 数据
  logger.info('Extracting Redux data...')
  let localStorageData = orginalData.localStorage

  // 从 IndexedDB 提取 topics（这是数据的真实来源，包含所有 topics）
  const indexedDb: ImportIndexedData = orginalData.indexedDB

  orginalData = null
  let persistDataString = localStorageData['persist:cherry-studio']
  localStorageData = null
  let rawReduxData = JSON.parse(persistDataString)
  persistDataString = null

  const reduxData: ImportReduxData = {
    assistants: JSON.parse(rawReduxData.assistants),
    llm: JSON.parse(rawReduxData.llm),
    websearch: JSON.parse(rawReduxData.websearch),
    settings: JSON.parse(rawReduxData.settings)
  }

  rawReduxData = null

  logger.info('Processing topics and messages...')
  // 从 Redux 构建 topic 的 assistantId 映射
  const topicsFromRedux = reduxData.assistants.assistants
    .flatMap(a => a.topics)
    .concat(reduxData.assistants.defaultAssistant.topics)

  const topicToAssistantMap = new Map<string, string>()
  for (const topic of topicsFromRedux) {
    topicToAssistantMap.set(topic.id, topic.assistantId)
  }

  const allMessages: Message[] = []
  const messagesByTopicId: Record<string, Message[]> = {}

  // 从 IndexedDB 提取所有 topics 和 messages
  for (const topic of indexedDb.topics) {
    if (topic.messages && topic.messages.length > 0) {
      messagesByTopicId[topic.id] = topic.messages
      allMessages.push(...topic.messages)
    }
  }

  logger.info(`Extracted ${allMessages.length} messages from ${indexedDb.topics.length} topics`)

  // 合并 topics：使用 IndexedDB 的 topics，补充 Redux 的元数据
  let topicsUsingDefaultFallback = 0
  const topicsWithMessages = indexedDb.topics.map(indexedTopic => {
    // 尝试从 Redux 中获取对应的 topic 元数据
    const reduxTopic = topicsFromRedux.find(t => t.id === indexedTopic.id)

    if (!reduxTopic) {
      topicsUsingDefaultFallback++
    }

    return {
      id: indexedTopic.id,
      assistantId: reduxTopic?.assistantId ?? 'default',
      name: reduxTopic?.name ?? 'Untitled Topic',
      createdAt: reduxTopic?.createdAt ?? Date.now(),
      updatedAt: reduxTopic?.updatedAt ?? Date.now(),
      isLoading: reduxTopic?.isLoading ?? false
    } satisfies Topic
  })

  if (topicsUsingDefaultFallback > 0) {
    logger.warn(`${topicsUsingDefaultFallback} topics not found in Redux data, using 'default' as assistantId fallback`)
  }

  topicToAssistantMap.clear()
  logger.info('Backup data transformation completed')

  return {
    reduxData: reduxData,
    indexedData: {
      topics: topicsWithMessages,
      message_blocks: indexedDb.message_blocks || [],
      messages: allMessages,
      settings: indexedDb.settings || []
    }
  }
}

async function getAllData(): Promise<string> {
  try {
    const [providers, webSearchProviders, assistants, topics, messages, messageBlocks] = await Promise.all([
      providerDatabase.getAllProviders(),
      websearchProviderDatabase.getAllWebSearchProviders(),
      assistantService.getExternalAssistants(),
      topicService.getTopics(),
      messageDatabase.getAllMessages(),
      messageBlockDatabase.getAllBlocks()
    ])

    // Get preferences for backup
    const userName = await preferenceService.get('user.name')
    const userAvatar = await preferenceService.get('user.avatar')
    const searchWithTime = await preferenceService.get('websearch.search_with_time')
    const maxResults = await preferenceService.get('websearch.max_results')
    const overrideSearchService = await preferenceService.get('websearch.override_search_service')
    const contentLimit = await preferenceService.get('websearch.content_limit')

    let defaultAssistant: Assistant | null = null

    try {
      defaultAssistant = await assistantService.getAssistant('default')
    } catch (error) {
      logger.warn('Failed to load default assistant from service, falling back to system config.', error)
    }

    if (!defaultAssistant) {
      const systemAssistants = getSystemAssistants()
      defaultAssistant = systemAssistants.find(assistant => assistant.id === 'default') || systemAssistants[0] || null
    }

    const topicsByAssistantId = topics.reduce<Record<string, Topic[]>>((accumulator, topic) => {
      if (!accumulator[topic.assistantId]) {
        accumulator[topic.assistantId] = []
      }

      accumulator[topic.assistantId].push(topic)
      return accumulator
    }, {})

    const defaultAssistantPayload: Assistant = defaultAssistant
      ? {
          ...defaultAssistant,
          topics: topicsByAssistantId[defaultAssistant.id] ?? defaultAssistant.topics ?? []
        }
      : {
          id: 'default',
          name: 'Default Assistant',
          prompt: '',
          topics: topicsByAssistantId['default'] ?? [],
          type: 'system'
        }

    const assistantsWithTopics = assistants.map(assistant => ({
      ...assistant,
      topics: topicsByAssistantId[assistant.id] ?? assistant.topics ?? []
    }))

    const assistantsPayload = {
      defaultAssistant: defaultAssistantPayload,
      assistants: assistantsWithTopics
    }

    const llmPayload = {
      providers
    }

    const websearchPayload = {
      searchWithTime,
      maxResults,
      overrideSearchService,
      contentLimit,
      providers: webSearchProviders
    }

    const settingsPayload = {
      userName
    }

    const persistDataString = JSON.stringify({
      assistants: JSON.stringify(assistantsPayload),
      llm: JSON.stringify(llmPayload),
      websearch: JSON.stringify(websearchPayload),
      settings: JSON.stringify(settingsPayload)
    })

    const localStorage: Record<string, string> = {
      'persist:cherry-studio': persistDataString
    }

    const messagesByTopic = messages.reduce<Record<string, Message[]>>((accumulator, message) => {
      if (!accumulator[message.topicId]) {
        accumulator[message.topicId] = []
      }

      accumulator[message.topicId].push(message)
      return accumulator
    }, {})

    const indexedSettings: Setting[] = userAvatar
      ? [
          {
            id: 'image://avatar',
            value: userAvatar
          }
        ]
      : []

    const indexedDB: ImportIndexedData = {
      topics: topics.map(topic => ({
        id: topic.id,
        messages: messagesByTopic[topic.id] ?? []
      })),
      message_blocks: messageBlocks,
      settings: indexedSettings
    }

    const backupData = JSON.stringify({
      time: Date.now(),
      version: 5,
      indexedDB,
      localStorage: localStorage
    })

    return backupData
  } catch (error) {
    logger.error('Error occurred during backup', error)
    throw error
  }
}

async function zipBackupData(backupData: string) {
  if (!DEFAULT_BACKUP_STORAGE.exists) {
    DEFAULT_BACKUP_STORAGE.create({ intermediates: true, idempotent: true })
  }

  const tempDirectory = new Directory(DEFAULT_BACKUP_STORAGE, `tmp-${Date.now()}`)
  tempDirectory.create({ intermediates: true })

  try {
    const dataFile = new File(tempDirectory, 'data.json')

    if (dataFile.exists) {
      dataFile.delete()
    }

    dataFile.write(backupData)

    const filename = `cherry-studio.${dayjs().format('YYYYMMDDHHmm')}.zip`
    const zipFile = new File(DEFAULT_BACKUP_STORAGE, filename)

    if (zipFile.exists) {
      zipFile.delete()
    }

    await zip([dataFile.uri], zipFile.uri)

    return zipFile.uri
  } catch (error) {
    logger.error('Failed to create backup zip:', error)
    throw error
  } finally {
    try {
      tempDirectory.delete()
    } catch (cleanupError) {
      logger.error('Failed to cleanup temporary backup directory:', cleanupError)
    }
  }
}

export async function backup() {
  // 1. 获取备份数据 json格式
  // 主要备份 providers websearchProviders assistants
  // topics messages message_blocks settings
  const backupData = await getAllData()
  // 2. 保存到zip中
  const backupFile = await zipBackupData(backupData)
  // 3. 返回文件路径
  return backupFile
}
