/**
 * @fileoverview StreamingService - Manages message streaming lifecycle and state
 *
 * This service encapsulates the streaming state management during message generation.
 * It uses CacheService for temporary storage during streaming,
 * and persists final data to the database via messageDatabase/messageBlockDatabase.
 *
 * Key Design Decisions:
 * - Uses messageId as primary key for tasks (supports multi-model concurrent streaming)
 * - Streaming data is stored in memory only (not in SQLite during streaming)
 * - On finalize, data is persisted to SQLite
 * - TTL-based auto-cleanup via CacheService to prevent memory leaks
 *
 * Architecture:
 * - CacheService: Infrastructure component for memory management (get/set/has/delete, TTL, GC)
 * - StreamingService: Business logic for streaming lifecycle (task management, block operations)
 */

import { messageBlockDatabase, messageDatabase } from '@database'

import { cacheService } from '@/services/CacheService'
import { loggerService } from '@/services/LoggerService'
import type { Message, MessageBlock } from '@/types/message'
import { AssistantMessageStatus, MessageBlockStatus } from '@/types/message'

const logger = loggerService.withContext('StreamingService')

// Task TTL for auto-cleanup (prevents memory leaks from crashed processes)
const TASK_TTL = 5 * 60 * 1000 // 5 minutes

// Cache key generators
const getTaskKey = (messageId: string) => `streaming.task.${messageId}` as const
const getBlockKey = (blockId: string) => `streaming.block.${blockId}` as const
const getMessageKey = (messageId: string) => `streaming.message.${messageId}` as const

/**
 * Streaming task data structure (stored in cache)
 */
interface StreamingTask {
  topicId: string
  messageId: string

  // Message data
  message: Message
  blocks: Record<string, MessageBlock>

  // Context for usage estimation (messages up to and including user message)
  contextMessages?: Message[]

  // Metadata
  startedAt: number
}

/**
 * StreamingService - Manages streaming message state during generation
 *
 * Responsibilities:
 * - Task lifecycle management (start, update, finalize, end)
 * - Block operations (add, update, get)
 * - Message operations (update, get)
 *
 * Memory management is delegated to CacheService which provides:
 * - TTL-based automatic expiration
 * - Periodic garbage collection
 */
class StreamingService {
  // Internal mapping: blockId -> messageId (kept in memory for efficiency)
  // This is a lightweight index that doesn't need TTL (cleared when task ends)
  private blockToMessageMap = new Map<string, string>()

  // ============ Task Lifecycle ============

  /**
   * Start a streaming task for a message
   *
   * IMPORTANT: The message must be created in DB before calling this.
   * This method initializes the in-memory streaming state.
   *
   * @param topicId - Topic ID
   * @param messageId - Message ID (already created in DB)
   * @param message - Initial message data
   * @param contextMessages - Optional context messages for usage estimation
   */
  startTask(topicId: string, messageId: string, message: Message, contextMessages?: Message[]): void {
    // End existing task if any (cleanup)
    if (cacheService.has(getTaskKey(messageId))) {
      this.endTask(messageId)
    }

    const task: StreamingTask = {
      topicId,
      messageId,
      message,
      blocks: {},
      contextMessages,
      startedAt: Date.now()
    }

    // Store task with TTL
    cacheService.set(getTaskKey(messageId), task, TASK_TTL)

    // Store message separately for quick access
    cacheService.set(getMessageKey(messageId), message, TASK_TTL)

    logger.debug('Started streaming task', { topicId, messageId })
  }

  /**
   * Finalize a streaming task by persisting data to SQLite
   *
   * This method:
   * 1. Ensures all blocks have final status
   * 2. Persists all blocks and message to SQLite
   * 3. Cleans up task from memory
   *
   * @param messageId - Task message ID
   * @param status - Final message status
   */
  async finalize(messageId: string, status: AssistantMessageStatus): Promise<void> {
    const task = this.getTask(messageId)
    if (!task) {
      logger.warn(`finalize called for non-existent task: ${messageId}`)
      return
    }

    try {
      const blocks = Object.values(task.blocks)

      // Ensure all blocks have final status
      const finalizedBlocks: MessageBlock[] = blocks.map(block => {
        if (block.status === MessageBlockStatus.STREAMING || block.status === MessageBlockStatus.PROCESSING) {
          return {
            ...block,
            status: status === AssistantMessageStatus.SUCCESS ? MessageBlockStatus.SUCCESS : MessageBlockStatus.ERROR
          } as MessageBlock
        }
        return block
      })

      // Prepare message updates
      const messageUpdates: Partial<Message> = {
        status,
        blocks: task.message.blocks,
        updatedAt: Date.now(),
        ...(task.message.usage && { usage: task.message.usage }),
        ...(task.message.metrics && { metrics: task.message.metrics })
      }

      // Persist to SQLite
      if (finalizedBlocks.length > 0) {
        await messageBlockDatabase.upsertBlocks(finalizedBlocks)
      }
      await messageDatabase.updateMessageById(messageId, messageUpdates)

      this.endTask(messageId)
      logger.debug('Finalized streaming task', { messageId, status, blockCount: finalizedBlocks.length })
    } catch (error) {
      logger.error('finalize failed:', error as Error)
      // Don't end task on error - TTL will auto-clean
      throw error
    }
  }

  /**
   * End a streaming task and clear all related memory
   *
   * @param messageId - Task message ID
   */
  endTask(messageId: string): void {
    const task = this.getTask(messageId)
    if (!task) {
      return
    }

    // Remove block mappings and block cache entries
    Object.keys(task.blocks).forEach(blockId => {
      this.blockToMessageMap.delete(blockId)
      cacheService.delete(getBlockKey(blockId))
    })

    // Remove message cache
    cacheService.delete(getMessageKey(messageId))

    // Remove task
    cacheService.delete(getTaskKey(messageId))

    logger.debug('Ended streaming task', { messageId, topicId: task.topicId })
  }

  // ============ Block Operations ============

  /**
   * Add a new block to a streaming task
   *
   * @param messageId - Parent message ID
   * @param block - Block to add
   */
  addBlock(messageId: string, block: MessageBlock): void {
    const task = this.getTask(messageId)
    if (!task) {
      logger.warn(`addBlock called for non-existent task: ${messageId}`)
      return
    }

    // Register block mapping
    this.blockToMessageMap.set(block.id, messageId)

    // Update message blocks array if not already included
    const newBlocks = task.message.blocks.includes(block.id)
      ? task.message.blocks
      : [...task.message.blocks, block.id]

    // Create updated message and task (immutable update)
    const newMessage: Message = { ...task.message, blocks: newBlocks }
    const newTask: StreamingTask = {
      ...task,
      message: newMessage,
      blocks: { ...task.blocks, [block.id]: block }
    }

    // Update caches with TTL refresh
    cacheService.set(getTaskKey(messageId), newTask, TASK_TTL)
    cacheService.set(getMessageKey(messageId), newMessage, TASK_TTL)
    cacheService.set(getBlockKey(block.id), block, TASK_TTL)

    logger.debug('Added block to task', { messageId, blockId: block.id, blockType: block.type })
  }

  /**
   * Update a block in a streaming task
   *
   * @param blockId - Block ID to update
   * @param changes - Partial block changes
   */
  updateBlock(blockId: string, changes: Partial<MessageBlock>): void {
    const messageId = this.blockToMessageMap.get(blockId)
    if (!messageId) {
      logger.warn(`updateBlock: Block ${blockId} not found in blockToMessageMap`)
      return
    }

    const task = this.getTask(messageId)
    if (!task) {
      logger.warn(`updateBlock: Task not found for message ${messageId}`)
      return
    }

    const existingBlock = task.blocks[blockId]
    if (!existingBlock) {
      logger.warn(`updateBlock: Block ${blockId} not found in task`)
      return
    }

    // Merge changes
    const updatedBlock = { ...existingBlock, ...changes } as MessageBlock

    // Create updated task (immutable update)
    const newTask: StreamingTask = {
      ...task,
      blocks: { ...task.blocks, [blockId]: updatedBlock }
    }

    // Update caches
    cacheService.set(getTaskKey(messageId), newTask, TASK_TTL)
    cacheService.set(getBlockKey(blockId), updatedBlock, TASK_TTL)
  }

  /**
   * Get a block from the streaming task
   *
   * @param blockId - Block ID
   * @returns Block or null if not found
   */
  getBlock(blockId: string): MessageBlock | null {
    return cacheService.get<MessageBlock>(getBlockKey(blockId)) || null
  }

  // ============ Message Operations ============

  /**
   * Update message properties in the streaming task
   *
   * @param messageId - Message ID
   * @param updates - Partial message updates
   */
  updateMessage(messageId: string, updates: Partial<Message>): void {
    const task = this.getTask(messageId)
    if (!task) {
      logger.warn(`updateMessage called for non-existent task: ${messageId}`)
      return
    }

    // Create updated message and task (immutable update)
    const newMessage = { ...task.message, ...updates }
    const newTask: StreamingTask = { ...task, message: newMessage }

    // Update caches with TTL refresh
    cacheService.set(getTaskKey(messageId), newTask, TASK_TTL)
    cacheService.set(getMessageKey(messageId), newMessage, TASK_TTL)
  }

  /**
   * Get a message from the streaming task
   *
   * @param messageId - Message ID
   * @returns Message or null if not found
   */
  getMessage(messageId: string): Message | null {
    return cacheService.get<Message>(getMessageKey(messageId)) || null
  }

  // ============ Query Methods ============

  /**
   * Check if a specific message is currently streaming
   *
   * @param messageId - Message ID
   * @returns True if message is streaming
   */
  isStreaming(messageId: string): boolean {
    return cacheService.has(getTaskKey(messageId))
  }

  /**
   * Get the streaming task for a message
   *
   * @param messageId - Message ID
   * @returns Task or null if not found
   */
  getTask(messageId: string): StreamingTask | null {
    return cacheService.get<StreamingTask>(getTaskKey(messageId)) || null
  }

  /**
   * Get all blocks for a message
   *
   * @param messageId - Message ID
   * @returns Array of blocks
   */
  getAllBlocks(messageId: string): MessageBlock[] {
    const task = this.getTask(messageId)
    if (!task) return []
    return Object.values(task.blocks)
  }

  /**
   * Get task stats for debugging
   */
  getStats(): { taskCount: number; blockMappings: number; cacheSize: number } {
    return {
      taskCount: cacheService.getKeysByPrefix('streaming.task.').length,
      blockMappings: this.blockToMessageMap.size,
      cacheSize: cacheService.size
    }
  }
}

// Export singleton instance
export const streamingService = new StreamingService()

// Also export class for testing
export { StreamingService }
export type { StreamingTask }
