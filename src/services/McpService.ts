/**
 * McpService - Unified MCP server management service with optimistic updates
 *
 * Design Principles:
 * 1. Singleton Pattern - Global unique instance with shared cache
 * 2. LRU Cache - Cache recently accessed MCP servers (20 servers)
 * 3. Type Safety - Full generic support with automatic type inference
 * 4. Observer Pattern - Integrated with React's useSyncExternalStore
 * 5. Optimistic Updates - Immediate UI response with background persistence
 *
 * Architecture:
 * ```
 * React Components
 *   ↓ useMcpServer / useAllMcpServers
 * React Hooks (useSyncExternalStore)
 *   ↓ subscribe / getSnapshot
 * McpService (This File)
 *   • LRU Cache (20 MCP servers)
 *   • All MCP Servers Cache (TTL: 5min)
 *   • Subscription Management (Map<mcpId, Set<callback>>)
 *   • Request Queue (Concurrency Control)
 *   • Error Handling + Logging
 *   ↓
 * mcpDatabase → SQLite
 * ```
 *
 * Cache Strategy:
 * - LRU Cache: 20 recently accessed MCP servers
 * - All MCP Servers Cache: All servers with 5-minute TTL
 * - Tools: NOT cached, fetched on each request from config/protocol
 *
 * @example Basic Usage
 * ```typescript
 * // Get MCP server
 * const mcpServer = await mcpService.getMcpServer(id)
 *
 * // Create new MCP server (optimistic)
 * const newMcp = await mcpService.createMcpServer(mcpData)
 *
 * // Subscribe to MCP server changes
 * const unsubscribe = mcpService.subscribeMcpServer(id, () => {
 *   console.log('MCP server changed!')
 * })
 * ```
 */

import { mcpDatabase } from '@database'

import { BUILTIN_TOOLS } from '@/config/mcp'
import { loggerService } from '@/services/LoggerService'
import type { MCPServer } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'

const logger = loggerService.withContext('McpService')

/**
 * Unsubscribe function returned by subscribe methods
 */
type UnsubscribeFunction = () => void

/**
 * McpService - Singleton service for managing MCP servers with optimistic updates
 */
export class McpService {
  // ==================== Singleton ====================
  private static instance: McpService

  private constructor() {
    logger.debug('McpService instance created')
  }

  /**
   * Get the singleton instance of McpService
   */
  public static getInstance(): McpService {
    if (!McpService.instance) {
      McpService.instance = new McpService()
    }
    return McpService.instance
  }

  // ==================== Core Storage ====================

  /**
   * LRU Cache for recently accessed MCP servers
   * Max size: 20 servers
   *
   * Structure: Map<mcpId, MCPServer>
   * When cache size exceeds limit, oldest entry is removed
   */
  private mcpCache = new Map<string, MCPServer>()

  /**
   * Maximum number of MCP servers to cache
   */
  private readonly MAX_CACHE_SIZE = 20

  /**
   * Access order tracking for LRU eviction
   * Most recently accessed at the end
   */
  private accessOrder: string[] = []

  /**
   * Promise for ongoing load operations per MCP server
   * Key: mcpId, Value: Promise
   */
  private loadPromises = new Map<string, Promise<MCPServer | null>>()

  /**
   * Cache for all MCP servers (Map for O(1) lookup by ID)
   * Key: MCP server ID
   * Value: MCPServer object
   */
  private allMcpServersCache = new Map<string, MCPServer>()

  /**
   * Timestamp when all MCP servers were last loaded from database
   * Used for TTL-based cache invalidation
   */
  private allMcpServersCacheTimestamp: number | null = null

  /**
   * Cache time-to-live in milliseconds (5 minutes)
   * After this duration, cache is considered stale
   */
  private readonly CACHE_TTL = 5 * 60 * 1000

  /**
   * Flag indicating if all MCP servers are being loaded
   */
  private isLoadingAllMcpServers = false

  /**
   * Promise for ongoing load all MCP servers operation
   * Prevents duplicate concurrent loads
   */
  private loadAllMcpServersPromise: Promise<MCPServer[]> | null = null

  // ==================== Subscription System ====================

  /**
   * Subscribers for specific MCP server changes
   * Key: mcpId
   * Value: Set of callback functions
   */
  private mcpServerSubscribers = new Map<string, Set<() => void>>()

  /**
   * Global subscribers that listen to all MCP server changes
   */
  private globalSubscribers = new Set<() => void>()

  /**
   * Subscribers for all MCP servers list changes
   * These are notified when the MCP servers list changes (create/update/delete)
   * Used by useAllMcpServers() hook
   */
  private allMcpServersSubscribers = new Set<() => void>()

  // ==================== Concurrency Control ====================

  /**
   * Update queue to ensure sequential writes for each MCP server
   * Prevents race conditions when the same MCP server is updated multiple times rapidly
   *
   * Key: mcpId
   * Value: Promise of the ongoing update operation
   */
  private updateQueue = new Map<string, Promise<void>>()

  // ==================== Public API: Query Operations ====================

  /**
   * Get an MCP server by ID with LRU caching (async)
   *
   * This method implements smart caching:
   * 1. Check LRU cache → return if cached
   * 2. Load from database → cache and return
   *
   * @param mcpId - The MCP server ID
   * @returns Promise resolving to the MCP server or null
   */
  public async getMcpServer(mcpId: string): Promise<MCPServer | null> {
    // 1. Check LRU cache
    if (this.mcpCache.has(mcpId)) {
      logger.verbose(`LRU cache hit for MCP server: ${mcpId}`)
      const mcpServer = this.mcpCache.get(mcpId)!
      this.updateAccessOrder(mcpId)
      return mcpServer
    }

    // 2. Check if already loading
    if (this.loadPromises.has(mcpId)) {
      logger.verbose(`Waiting for ongoing load: ${mcpId}`)
      return await this.loadPromises.get(mcpId)!
    }

    // 3. Load from database
    logger.debug(`Loading MCP server from database: ${mcpId}`)
    const loadPromise = this.loadMcpServerFromDatabase(mcpId)
    this.loadPromises.set(mcpId, loadPromise)

    try {
      const mcpServer = await loadPromise
      return mcpServer
    } finally {
      this.loadPromises.delete(mcpId)
    }
  }

  /**
   * Get an MCP server by ID synchronously (from cache only)
   *
   * Returns immediately from cache. Returns null if not cached.
   *
   * @param mcpId - The MCP server ID
   * @returns The cached MCP server or null
   */
  public getMcpServerCached(mcpId: string): MCPServer | null {
    // Check LRU cache
    if (this.mcpCache.has(mcpId)) {
      const mcpServer = this.mcpCache.get(mcpId)!
      this.updateAccessOrder(mcpId)
      return mcpServer
    }

    // Check all MCP servers cache
    if (this.allMcpServersCache.has(mcpId)) {
      return this.allMcpServersCache.get(mcpId)!
    }

    return null
  }

  /**
   * Get all MCP servers with caching
   *
   * Loads from cache if available and not stale, otherwise loads from database.
   * This is the main method for loading all MCP servers with automatic caching.
   *
   * @param forceRefresh - Force reload from database even if cache is valid
   * @returns Promise resolving to array of all MCP servers
   */
  public async getAllMcpServers(forceRefresh = false): Promise<MCPServer[]> {
    // Check if cache is valid
    const isCacheValid =
      !forceRefresh &&
      this.allMcpServersCacheTimestamp !== null &&
      Date.now() - this.allMcpServersCacheTimestamp < this.CACHE_TTL &&
      this.allMcpServersCache.size > 0

    if (isCacheValid) {
      logger.verbose('Returning cached MCP servers, cache size:', this.allMcpServersCache.size)
      return Array.from(this.allMcpServersCache.values())
    }

    // If already loading, wait for ongoing load
    if (this.isLoadingAllMcpServers && this.loadAllMcpServersPromise) {
      logger.verbose('Waiting for ongoing getAllMcpServers operation')
      return await this.loadAllMcpServersPromise
    }

    // Load from database
    return await this.loadAllMcpServersFromDatabase()
  }

  /**
   * Get all MCP servers from cache (synchronous)
   *
   * Returns cached MCP servers immediately. If cache is empty, returns empty array.
   * Used by React's useSyncExternalStore for synchronous snapshot.
   *
   * @returns Array of cached MCP servers
   */
  public getAllMcpServersCached(): MCPServer[] {
    return Array.from(this.allMcpServersCache.values())
  }

  /**
   * Get all active MCP servers
   *
   * @returns Promise resolving to array of active MCP servers
   */
  public async getActiveMcpServers(): Promise<MCPServer[]> {
    const allServers = await this.getAllMcpServers()
    return allServers.filter(server => server.isActive)
  }

  /**
   * Get MCP tools for a specific MCP server (NOT cached)
   *
   * Tools are fetched on each request from:
   * - Builtin tools config (for internal MCP servers)
   * - MCP protocol (for external servers, future implementation)
   *
   * @param mcpId - The MCP server ID
   * @returns Promise resolving to array of MCP tools
   */
  public async getMcpTools(mcpId: string): Promise<MCPTool[]> {
    try {
      const mcpServer = await this.getMcpServer(mcpId)

      if (!mcpServer) {
        logger.warn(`MCP server ${mcpId} not found`)
        return []
      }

      // Get tools from builtin config (temporary, until MCP protocol is implemented)
      const tools = BUILTIN_TOOLS[mcpServer.id] || []

      // Filter disabled tools
      if (mcpServer.disabledTools && mcpServer.disabledTools.length > 0) {
        return tools.filter(tool => !mcpServer.disabledTools?.includes(tool.name))
      }

      return tools
    } catch (error) {
      logger.error(`Failed to get MCP tools for ${mcpId}:`, error as Error)
      return []
    }
  }

  // ==================== Public API: CRUD Operations ====================

  /**
   * Create a new MCP server (optimistic)
   *
   * Creates MCP server immediately in memory, then persists to database.
   *
   * @param mcpServer - The MCP server data
   * @returns The created MCP server
   */
  public async createMcpServer(mcpServer: MCPServer): Promise<MCPServer> {
    logger.info('Creating new MCP server (optimistic):', mcpServer.id)

    // Optimistic update: add to caches immediately
    if (this.allMcpServersCache.size > 0 || this.allMcpServersCacheTimestamp !== null) {
      this.allMcpServersCache.set(mcpServer.id, mcpServer)
      logger.verbose(`Added new MCP server to cache: ${mcpServer.id}`)
    }

    // Notify subscribers (UI updates immediately)
    this.notifyMcpServerSubscribers(mcpServer.id)
    this.notifyGlobalSubscribers()
    this.notifyAllMcpServersSubscribers()

    try {
      // Persist to database
      await mcpDatabase.upsertMcps([mcpServer])
      logger.info('MCP server created successfully:', mcpServer.id)
      return mcpServer
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to create MCP server, rolling back:', error as Error)

      // Remove from cache
      if (this.allMcpServersCache.has(mcpServer.id)) {
        this.allMcpServersCache.delete(mcpServer.id)
      }

      // Notify subscribers to revert UI
      this.notifyMcpServerSubscribers(mcpServer.id)
      this.notifyGlobalSubscribers()
      this.notifyAllMcpServersSubscribers()

      throw error
    }
  }

  /**
   * Update an MCP server (optimistic)
   *
   * Updates immediately in cache, then persists.
   *
   * @param mcpId - The MCP server ID to update
   * @param updates - Partial MCP server data to update
   */
  public async updateMcpServer(mcpId: string, updates: Partial<Omit<MCPServer, 'id'>>): Promise<void> {
    // Wait for any ongoing update to the same MCP server
    const previousUpdate = this.updateQueue.get(mcpId)
    if (previousUpdate) {
      await previousUpdate
    }

    // Execute current update
    const currentUpdate = this.performMcpServerUpdate(mcpId, updates)
    this.updateQueue.set(mcpId, currentUpdate)

    try {
      await currentUpdate
    } finally {
      // Clean up queue
      if (this.updateQueue.get(mcpId) === currentUpdate) {
        this.updateQueue.delete(mcpId)
      }
    }
  }

  /**
   * Delete an MCP server (optimistic)
   *
   * Removes from cache, then deletes from database.
   *
   * @param mcpId - The MCP server ID to delete
   */
  public async deleteMcpServer(mcpId: string): Promise<void> {
    logger.info('Deleting MCP server (optimistic):', mcpId)

    // Save old data for rollback
    const oldCachedServer = this.allMcpServersCache.get(mcpId)
    const oldLRUServer = this.mcpCache.get(mcpId)

    // Remove from all caches
    if (this.allMcpServersCache.has(mcpId)) {
      this.allMcpServersCache.delete(mcpId)
      logger.verbose(`Removed MCP server from all servers cache: ${mcpId}`)
    }

    if (this.mcpCache.has(mcpId)) {
      this.mcpCache.delete(mcpId)
      const index = this.accessOrder.indexOf(mcpId)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      logger.verbose(`Removed MCP server from LRU cache: ${mcpId}`)
    }

    // Notify subscribers (UI updates immediately)
    this.notifyMcpServerSubscribers(mcpId)
    this.notifyGlobalSubscribers()
    this.notifyAllMcpServersSubscribers()

    try {
      // Delete from database
      await mcpDatabase.deleteMcpById(mcpId)
      logger.info('MCP server deleted successfully:', mcpId)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to delete MCP server, rolling back:', error as Error)

      // Restore caches
      if (oldCachedServer) {
        this.allMcpServersCache.set(mcpId, oldCachedServer)
      }
      if (oldLRUServer) {
        this.mcpCache.set(mcpId, oldLRUServer)
        this.accessOrder.push(mcpId)
      }

      // Notify subscribers to revert UI
      this.notifyMcpServerSubscribers(mcpId)
      this.notifyGlobalSubscribers()
      this.notifyAllMcpServersSubscribers()

      throw error
    }
  }

  // ==================== Public API: Cache Operations ====================

  /**
   * Refresh all MCP servers cache from database
   *
   * Forces a reload of all MCP servers from database, updating the cache.
   * Useful for pull-to-refresh functionality.
   *
   * @returns Promise resolving to array of refreshed MCP servers
   */
  public async refreshAllMcpServersCache(): Promise<MCPServer[]> {
    logger.info('Manually refreshing all MCP servers cache')
    return await this.getAllMcpServers(true)
  }

  /**
   * Invalidate all MCP servers cache
   *
   * Clears the cache and forces next access to reload from database.
   * Used for logout or data reset scenarios.
   */
  public invalidateCache(): void {
    this.allMcpServersCache.clear()
    this.allMcpServersCacheTimestamp = null
    this.mcpCache.clear()
    this.accessOrder = []
    logger.info('All MCP servers cache invalidated')
    this.notifyAllMcpServersSubscribers()
  }

  // ==================== Public API: Subscription ====================

  /**
   * Subscribe to changes for a specific MCP server
   *
   * @param mcpId - The MCP server ID to watch
   * @param callback - Function to call when the MCP server changes
   * @returns Unsubscribe function
   */
  public subscribeMcpServer(mcpId: string, callback: () => void): UnsubscribeFunction {
    if (!this.mcpServerSubscribers.has(mcpId)) {
      this.mcpServerSubscribers.set(mcpId, new Set())
    }

    const subscribers = this.mcpServerSubscribers.get(mcpId)!
    subscribers.add(callback)

    logger.verbose(`Added subscriber for MCP server ${mcpId}, total: ${subscribers.size}`)

    return () => {
      subscribers.delete(callback)

      // Clean up empty subscriber sets
      if (subscribers.size === 0) {
        this.mcpServerSubscribers.delete(mcpId)
        logger.verbose(`Removed last subscriber for MCP server ${mcpId}, cleaned up`)
      } else {
        logger.verbose(`Removed subscriber for MCP server ${mcpId}, remaining: ${subscribers.size}`)
      }
    }
  }

  /**
   * Subscribe to all MCP server changes
   *
   * @param callback - Function to call when any MCP server changes
   * @returns Unsubscribe function
   */
  public subscribeAll(callback: () => void): UnsubscribeFunction {
    this.globalSubscribers.add(callback)
    logger.verbose(`Added global subscriber, total: ${this.globalSubscribers.size}`)

    return () => {
      this.globalSubscribers.delete(callback)
      logger.verbose(`Removed global subscriber, remaining: ${this.globalSubscribers.size}`)
    }
  }

  /**
   * Subscribe to all MCP servers list changes
   *
   * The callback is invoked whenever the MCP servers list changes (create/update/delete).
   * Used by useAllMcpServers() hook with useSyncExternalStore.
   *
   * @param callback - Function to call when MCP servers list changes
   * @returns Unsubscribe function
   */
  public subscribeAllMcpServers(callback: () => void): UnsubscribeFunction {
    this.allMcpServersSubscribers.add(callback)
    logger.verbose(`Added all MCP servers subscriber, total: ${this.allMcpServersSubscribers.size}`)

    return () => {
      this.allMcpServersSubscribers.delete(callback)
      logger.verbose(`Removed all MCP servers subscriber, remaining: ${this.allMcpServersSubscribers.size}`)
    }
  }

  // ==================== Private Methods: Database Operations ====================

  /**
   * Load an MCP server from database and add to LRU cache
   */
  private async loadMcpServerFromDatabase(mcpId: string): Promise<MCPServer | null> {
    try {
      const mcpServer = await mcpDatabase.getMcpById(mcpId)

      if (mcpServer) {
        // Add to LRU cache
        this.addToCache(mcpId, mcpServer)
        logger.debug(`Loaded MCP server from database and cached: ${mcpId}`)
        return mcpServer
      } else {
        logger.warn(`MCP server ${mcpId} not found in database`)
        return null
      }
    } catch (error) {
      logger.error(`Failed to load MCP server ${mcpId} from database:`, error as Error)
      return null
    }
  }

  /**
   * Load all MCP servers from database and update cache
   *
   * This method is called when cache is invalid or forced refresh is requested.
   * It prevents duplicate concurrent loads using a promise flag.
   */
  private async loadAllMcpServersFromDatabase(): Promise<MCPServer[]> {
    // If already loading, wait for the ongoing operation
    if (this.isLoadingAllMcpServers && this.loadAllMcpServersPromise) {
      logger.verbose('Waiting for ongoing loadAllMcpServers operation')
      return await this.loadAllMcpServersPromise
    }

    // Start loading
    this.isLoadingAllMcpServers = true
    this.loadAllMcpServersPromise = (async () => {
      try {
        logger.info('Loading all MCP servers from database')
        const mcpServers = await mcpDatabase.getMcps()

        // Update cache
        this.allMcpServersCache.clear()
        mcpServers.forEach(server => {
          this.allMcpServersCache.set(server.id, server)
        })

        // Update timestamp
        this.allMcpServersCacheTimestamp = Date.now()

        logger.info(`Loaded ${mcpServers.length} MCP servers into cache`)

        // Notify subscribers
        this.notifyAllMcpServersSubscribers()

        return mcpServers
      } catch (error) {
        logger.error('Failed to load all MCP servers from database:', error as Error)
        throw error
      } finally {
        this.isLoadingAllMcpServers = false
        this.loadAllMcpServersPromise = null
      }
    })()

    return await this.loadAllMcpServersPromise
  }

  /**
   * Perform optimistic MCP server update with rollback on failure
   */
  private async performMcpServerUpdate(mcpId: string, updates: Partial<Omit<MCPServer, 'id'>>): Promise<void> {
    // Save old data for rollback
    const oldLRUServer = this.mcpCache.get(mcpId) ? { ...this.mcpCache.get(mcpId)! } : null
    const oldAllServersServer = this.allMcpServersCache.get(mcpId) ? { ...this.allMcpServersCache.get(mcpId)! } : null

    try {
      // Fetch current MCP server data
      let currentServerData: MCPServer

      // Try to get from LRU cache
      if (this.mcpCache.has(mcpId)) {
        currentServerData = this.mcpCache.get(mcpId)!
      }
      // Try to get from all servers cache
      else if (this.allMcpServersCache.has(mcpId)) {
        currentServerData = this.allMcpServersCache.get(mcpId)!
      }
      // Load from database
      else {
        const server = await mcpDatabase.getMcpById(mcpId)
        if (!server) {
          throw new Error(`MCP server with ID ${mcpId} not found`)
        }
        currentServerData = server
      }

      // Prepare updated server
      const updatedServer: MCPServer = {
        ...currentServerData,
        ...updates,
        id: mcpId // Ensure ID is not overwritten
      }

      // Optimistic update: update all caches
      this.updateMcpServerInCache(mcpId, updatedServer)

      // Notify subscribers (UI updates immediately)
      this.notifyMcpServerSubscribers(mcpId)

      // Persist to database
      await mcpDatabase.upsertMcps([updatedServer])

      // Notify other subscribers
      this.notifyGlobalSubscribers()
      this.notifyAllMcpServersSubscribers()

      logger.debug(`MCP server updated successfully: ${mcpId}`)
    } catch (error) {
      // Rollback on failure
      logger.error('Failed to update MCP server, rolling back:', error as Error)

      // Rollback LRU cache
      if (oldLRUServer) {
        this.mcpCache.set(mcpId, oldLRUServer)
      } else {
        this.mcpCache.delete(mcpId)
      }

      // Rollback all servers cache
      if (oldAllServersServer) {
        this.allMcpServersCache.set(mcpId, oldAllServersServer)
      } else {
        this.allMcpServersCache.delete(mcpId)
      }

      // Notify subscribers to revert UI
      this.notifyMcpServerSubscribers(mcpId)

      throw error
    }
  }

  // ==================== Private Methods: Notification ====================

  /**
   * Notify all subscribers for a specific MCP server
   */
  private notifyMcpServerSubscribers(mcpId: string): void {
    const subscribers = this.mcpServerSubscribers.get(mcpId)
    if (subscribers && subscribers.size > 0) {
      logger.verbose(`Notifying ${subscribers.size} subscribers for MCP server ${mcpId}`)
      subscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error(`Error in MCP server ${mcpId} subscriber callback:`, error as Error)
        }
      })
    }
  }

  /**
   * Notify all global subscribers
   */
  private notifyGlobalSubscribers(): void {
    if (this.globalSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.globalSubscribers.size} global subscribers`)
      this.globalSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in global subscriber callback:', error as Error)
        }
      })
    }
  }

  /**
   * Notify all MCP servers list subscribers
   *
   * Called when the MCP servers list changes (create/update/delete).
   * Used by useAllMcpServers() hook with useSyncExternalStore.
   */
  private notifyAllMcpServersSubscribers(): void {
    if (this.allMcpServersSubscribers.size > 0) {
      logger.verbose(`Notifying ${this.allMcpServersSubscribers.size} all MCP servers subscribers`)
      this.allMcpServersSubscribers.forEach(callback => {
        try {
          callback()
        } catch (error) {
          logger.error('Error in all MCP servers subscriber callback:', error as Error)
        }
      })
    }
  }

  // ==================== Private Methods: LRU Cache Management ====================

  /**
   * Add or update an MCP server in the LRU cache
   *
   * If cache is full, evicts the oldest entry.
   * Updates access order.
   *
   * @param mcpId - The MCP server ID
   * @param mcpServer - The MCP server data
   */
  private addToCache(mcpId: string, mcpServer: MCPServer): void {
    // If cache is full and server is not already cached, evict oldest
    if (!this.mcpCache.has(mcpId) && this.mcpCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestFromCache()
    }

    // Add or update in cache
    this.mcpCache.set(mcpId, mcpServer)

    // Update access order
    this.updateAccessOrder(mcpId)

    logger.verbose(`Added MCP server to LRU cache: ${mcpId} (cache size: ${this.mcpCache.size})`)
  }

  /**
   * Update access order for LRU eviction
   *
   * Moves the mcpId to the end of the access order (most recently used).
   *
   * @param mcpId - The MCP server ID to update
   */
  private updateAccessOrder(mcpId: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(mcpId)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }

    // Add to end (most recently used)
    this.accessOrder.push(mcpId)
  }

  /**
   * Evict the oldest (least recently used) MCP server from cache
   */
  private evictOldestFromCache(): void {
    if (this.accessOrder.length === 0) {
      logger.warn('Attempted to evict from empty LRU cache')
      return
    }

    // Get oldest server (first in access order)
    const oldestMcpId = this.accessOrder.shift()!

    // Remove from cache
    this.mcpCache.delete(oldestMcpId)

    logger.debug(`Evicted oldest MCP server from LRU cache: ${oldestMcpId}`)
  }

  /**
   * Update an MCP server in all caches
   *
   * Updates the MCP server in:
   * - mcpCache (LRU cache)
   * - allMcpServersCache (if exists)
   *
   * @param mcpId - The MCP server ID
   * @param updatedServer - The updated MCP server data
   */
  private updateMcpServerInCache(mcpId: string, updatedServer: MCPServer): void {
    // Update LRU cache if it exists
    if (this.mcpCache.has(mcpId)) {
      this.mcpCache.set(mcpId, updatedServer)
      this.updateAccessOrder(mcpId)
      logger.verbose(`Updated LRU cache for MCP server: ${mcpId}`)
    }

    // Update all servers cache if it exists
    if (this.allMcpServersCache.has(mcpId)) {
      this.allMcpServersCache.set(mcpId, updatedServer)
      logger.verbose(`Updated all servers cache for MCP server: ${mcpId}`)
    }
  }

  // ==================== Debug Methods ====================

  /**
   * Get current cache status (for debugging)
   */
  public getCacheStatus(): {
    lruCache: {
      size: number
      maxSize: number
      mcpIds: string[]
      accessOrder: string[]
    }
    allServersCache: {
      size: number
      isCacheValid: boolean
      cacheAge: number | null
    }
  } {
    const cacheAge = this.allMcpServersCacheTimestamp !== null ? Date.now() - this.allMcpServersCacheTimestamp : null

    return {
      lruCache: {
        size: this.mcpCache.size,
        maxSize: this.MAX_CACHE_SIZE,
        mcpIds: Array.from(this.mcpCache.keys()),
        accessOrder: [...this.accessOrder]
      },
      allServersCache: {
        size: this.allMcpServersCache.size,
        isCacheValid:
          this.allMcpServersCacheTimestamp !== null && Date.now() - this.allMcpServersCacheTimestamp < this.CACHE_TTL,
        cacheAge
      }
    }
  }

  /**
   * Print detailed cache status to console (for debugging)
   */
  public logCacheStatus(): void {
    const status = this.getCacheStatus()

    logger.info('==================== McpService Cache Status ====================')
    logger.info('LRU Cache:')
    logger.info(`  - Size: ${status.lruCache.size}/${status.lruCache.maxSize}`)
    logger.info(`  - Cached MCP Servers: [${status.lruCache.mcpIds.join(', ')}]`)
    logger.info(`  - Access Order (oldest→newest): [${status.lruCache.accessOrder.join(', ')}]`)
    logger.info('')
    logger.info('All MCP Servers Cache:')
    logger.info(`  - Size: ${status.allServersCache.size}`)
    logger.info(`  - Valid: ${status.allServersCache.isCacheValid}`)
    if (status.allServersCache.cacheAge !== null) {
      logger.info(`  - Age: ${Math.round(status.allServersCache.cacheAge / 1000)}s`)
    }
    logger.info('================================================================')
  }
}

// ==================== Exported Singleton Instance ====================

/**
 * Singleton instance of McpService
 *
 * Use this instance throughout the application for MCP server management.
 *
 * @example
 * ```typescript
 * import { mcpService } from '@/services/McpService'
 *
 * const mcpServer = await mcpService.getMcpServer(id)
 * await mcpService.createMcpServer(mcpData)
 * await mcpService.updateMcpServer(id, updates)
 * ```
 */
export const mcpService = McpService.getInstance()

// ==================== Legacy Function Exports (Backward Compatibility) ====================

/**
 * Get active MCP servers
 * @deprecated Use mcpService.getActiveMcpServers() instead
 */
export async function getActiveMcps() {
  return await mcpService.getActiveMcpServers()
}

/**
 * Fetch MCP tools for a server
 * @deprecated Use mcpService.getMcpTools() instead
 */
export async function fetchMcpTools(mcpServer: MCPServer) {
  return await mcpService.getMcpTools(mcpServer.id)
}
