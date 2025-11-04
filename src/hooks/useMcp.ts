import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { loggerService } from '@/services/LoggerService'
import { mcpService } from '@/services/McpService'
import type { MCPServer } from '@/types/mcp'
import type { MCPTool } from '@/types/tool'

const logger = loggerService.withContext('useMcp')

/**
 * React Hook for managing a specific MCP server (Refactored with useSyncExternalStore)
 *
 * Uses McpService with optimistic updates for zero-latency UX.
 * Integrates with React 18's useSyncExternalStore for efficient re-renders.
 *
 * @param mcpId - The MCP server ID to manage
 *
 * @example
 * ```typescript
 * function McpServerDetail({ mcpId }) {
 *   const {
 *     mcpServer,
 *     isLoading,
 *     updateMcpServer,
 *     deleteMcpServer
 *   } = useMcpServer(mcpId)
 *
 *   return (
 *     <div>
 *       MCP Server: {mcpServer?.name}
 *       <button onClick={() => updateMcpServer({ isActive: true })}>
 *         Activate
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpServer(mcpId: string) {
  // ==================== Subscription (useSyncExternalStore) ====================

  /**
   * Subscribe to MCP server changes
   */
  const subscribe = useCallback(
    (callback: () => void) => {
      logger.verbose(`Subscribing to MCP server changes: ${mcpId}`)
      return mcpService.subscribeMcpServer(mcpId, callback)
    },
    [mcpId]
  )

  /**
   * Get MCP server snapshot (synchronous)
   */
  const getSnapshot = useCallback(() => {
    return mcpService.getMcpServerCached(mcpId)
  }, [mcpId])

  /**
   * Server snapshot (for SSR compatibility - not used in React Native)
   */
  const getServerSnapshot = useCallback(() => {
    return null
  }, [])

  // Use useSyncExternalStore for reactive updates
  const mcpServer = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Loading State ====================

  /**
   * Track if we're loading the MCP server from database
   */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Validate mcpId
   */
  const isValidId = mcpId && mcpId.length > 0

  /**
   * Load MCP server on mount if not cached
   */
  useEffect(() => {
    if (!mcpServer && isValidId) {
      setIsLoading(true)
      mcpService
        .getMcpServer(mcpId)
        .then(() => {
          setIsLoading(false)
        })
        .catch(error => {
          logger.error(`Failed to load MCP server ${mcpId}:`, error as Error)
          setIsLoading(false)
        })
    }
  }, [mcpServer, mcpId, isValidId])

  // ==================== Action Methods ====================

  /**
   * Update MCP server (optimistic)
   */
  const updateMcpServer = useCallback(
    async (updates: Partial<Omit<MCPServer, 'id'>>) => {
      try {
        await mcpService.updateMcpServer(mcpId, updates)
      } catch (error) {
        logger.error(`Failed to update MCP server ${mcpId}:`, error as Error)
        throw error
      }
    },
    [mcpId]
  )

  /**
   * Delete MCP server (optimistic)
   */
  const deleteMcpServer = useCallback(async () => {
    try {
      await mcpService.deleteMcpServer(mcpId)
    } catch (error) {
      logger.error(`Failed to delete MCP server ${mcpId}:`, error as Error)
      throw error
    }
  }, [mcpId])

  // ==================== Return Values ====================

  return {
    mcpServer,
    isLoading,
    updateMcpServer,
    deleteMcpServer
  }
}

/**
 * React Hook for getting all MCP servers
 *
 * Uses McpService with caching for optimal performance.
 *
 * @example
 * ```typescript
 * function McpServerList() {
 *   const { mcpServers, isLoading, updateMcpServers } = useMcpServers()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <ul>
 *       {mcpServers.map(server => (
 *         <li key={server.id}>{server.name}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useMcpServers() {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to all MCP servers changes')
    return mcpService.subscribeAllMcpServers(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any MCP server changes
      loadAllMcpServers()
    })

    loadAllMcpServers()

    return unsubscribe
  }, [subscribe])

  const loadAllMcpServers = async () => {
    try {
      setIsLoading(true)
      const allMcpServers = await mcpService.getAllMcpServers()
      setMcpServers(allMcpServers)
    } catch (error) {
      logger.error('Failed to load all MCP servers:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateMcpServers = useCallback(async (updates: MCPServer[]) => {
    for (const mcpServer of updates) {
      await mcpService.updateMcpServer(mcpServer.id, mcpServer)
    }
  }, [])

  return {
    mcpServers,
    isLoading,
    updateMcpServers
  }
}

/**
 * React Hook for managing active MCP servers
 *
 * Uses McpService's getActiveMcpServers method for efficient filtering.
 *
 * @example
 * ```typescript
 * function ActiveMcpServerList() {
 *   const { activeMcpServers, isLoading, updateMcpServers } = useActiveMcpServers()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       Active Servers: {activeMcpServers.length}
 *       {activeMcpServers.map(server => (
 *         <div key={server.id}>{server.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useActiveMcpServers() {
  const [activeMcpServers, setActiveMcpServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Subscribe to changes
   */
  const subscribe = useCallback((callback: () => void) => {
    logger.verbose('Subscribing to active MCP servers changes')
    return mcpService.subscribeAllMcpServers(callback)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      // Reload when any MCP server changes
      loadActiveMcpServers()
    })

    loadActiveMcpServers()

    return unsubscribe
  }, [subscribe])

  const loadActiveMcpServers = async () => {
    try {
      setIsLoading(true)
      const activeServers = await mcpService.getActiveMcpServers()
      setActiveMcpServers(activeServers)
    } catch (error) {
      logger.error('Failed to load active MCP servers:', error as Error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateMcpServers = useCallback(async (updates: MCPServer[]) => {
    for (const mcpServer of updates) {
      await mcpService.updateMcpServer(mcpServer.id, mcpServer)
    }
  }, [])

  return {
    activeMcpServers,
    isLoading,
    updateMcpServers
  }
}

/**
 * React Hook for fetching MCP tools for a specific server (NOT cached)
 *
 * Tools are fetched on each mount and when mcpId changes.
 * Tools are NOT cached - they are refetched each time.
 *
 * @param mcpId - The MCP server ID
 *
 * @example
 * ```typescript
 * function McpToolsList({ mcpId }) {
 *   const { tools, isLoading, refetch } = useMcpTools(mcpId)
 *
 *   return (
 *     <div>
 *       Tools: {tools.length}
 *       {tools.map(tool => (
 *         <div key={tool.id}>{tool.name}</div>
 *       ))}
 *       <button onClick={refetch}>Refresh Tools</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useMcpTools(mcpId: string) {
  const [tools, setTools] = useState<MCPTool[]>([])
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Fetch tools for the MCP server
   */
  const fetchTools = useCallback(async () => {
    if (!mcpId || mcpId.length === 0) {
      setTools([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const fetchedTools = await mcpService.getMcpTools(mcpId)
      setTools(fetchedTools)
      setIsLoading(false)
    } catch (error) {
      logger.error(`Failed to fetch tools for MCP server ${mcpId}:`, error as Error)
      setTools([])
      setIsLoading(false)
    }
  }, [mcpId])

  /**
   * Fetch tools on mount and when mcpId changes
   */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!mcpId || mcpId.length === 0) {
        setTools([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const fetchedTools = await mcpService.getMcpTools(mcpId)
        if (!cancelled) {
          setTools(fetchedTools)
          setIsLoading(false)
        }
      } catch (error) {
        if (!cancelled) {
          logger.error(`Failed to fetch tools for MCP server ${mcpId}:`, error as Error)
          setTools([])
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [mcpId])

  /**
   * Refetch tools manually
   */
  const refetch = useCallback(() => {
    fetchTools()
  }, [fetchTools])

  return {
    tools,
    isLoading,
    refetch
  }
}
