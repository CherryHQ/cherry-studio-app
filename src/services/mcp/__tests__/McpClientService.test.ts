/**
 * McpClientService tests
 *
 * Tests for the MCP Client connection management service.
 */

// Import after mocks
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'
import { Client } from '@modelcontextprotocol/sdk/client'

import type { MCPServer } from '@/types/mcp'

import { mcpClientService } from '../McpClientService'

// Create mock functions that will be used by the mocks
const mockConnect = jest.fn()
const mockClose = jest.fn()
const mockListTools = jest.fn()
const mockCallTool = jest.fn()
const mockTransportClose = jest.fn()
const mockCreateMobileOAuthProvider = jest.fn()
const mockPerformOAuthFlow = jest.fn()

// Mock modules - Jest hoists these to the top
jest.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool
  }))
}))

jest.mock('@cherrystudio/react-native-streamable-http', () => ({
  RNStreamableHTTPClientTransport: jest.fn().mockImplementation(() => ({
    close: mockTransportClose,
    onmessage: null,
    onerror: null,
    onclose: null
  }))
}))

jest.mock('../oauth', () => ({
  createMobileOAuthProvider: (...args: unknown[]) => mockCreateMobileOAuthProvider(...args),
  performOAuthFlow: (...args: unknown[]) => mockPerformOAuthFlow(...args)
}))

// Helper to create mock MCPServer
const createMockServer = (overrides?: Partial<MCPServer>): MCPServer => ({
  id: 'test-server-id',
  name: 'Test Server',
  type: 'streamableHttp',
  baseUrl: 'https://example.com/mcp',
  isActive: true,
  ...overrides
})

// Access service internals for test isolation
const getServiceInternals = () => {
  const service = mcpClientService as any
  return {
    clients: service.clients as Map<string, unknown>,
    pendingClients: service.pendingClients as Map<string, Promise<unknown>>,
    toolsCache: service.toolsCache as Map<string, unknown>
  }
}

// Reset service state between tests
const resetServiceState = () => {
  const internals = getServiceInternals()
  internals.clients.clear()
  internals.pendingClients.clear()
  internals.toolsCache.clear()
}

describe('McpClientService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetServiceState()

    // Set up default mock implementations
    mockConnect.mockResolvedValue(undefined)
    mockClose.mockResolvedValue(undefined)
    mockListTools.mockResolvedValue({ tools: [] })
    mockCallTool.mockResolvedValue({ isError: false, content: [] })
    mockTransportClose.mockResolvedValue(undefined)
    mockCreateMobileOAuthProvider.mockReturnValue({})
    mockPerformOAuthFlow.mockResolvedValue(true)
  })

  // ==================== Singleton Tests ====================
  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      // The exported mcpClientService is already a singleton
      expect(mcpClientService).toBeDefined()
      expect(typeof mcpClientService.getClient).toBe('function')
    })
  })

  // ==================== Client Pool Tests ====================
  describe('Client Pool Management', () => {
    describe('getClient', () => {
      it('should create a new client for a server', async () => {
        const server = createMockServer()

        const client = await mcpClientService.getClient(server)

        expect(Client).toHaveBeenCalledTimes(1)
        expect(RNStreamableHTTPClientTransport).toHaveBeenCalledWith(server.baseUrl, expect.any(Object))
        const transportOptions = (RNStreamableHTTPClientTransport as jest.Mock).mock.calls[0][1]
        expect(transportOptions).not.toHaveProperty('manualAuthOnly')
        expect(mockConnect).toHaveBeenCalledTimes(1)
        expect(client).toBeDefined()
      })

      it('should reuse existing client for same server', async () => {
        const server = createMockServer()

        const client1 = await mcpClientService.getClient(server)
        const client2 = await mcpClientService.getClient(server)

        expect(Client).toHaveBeenCalledTimes(1)
        expect(client1).toBe(client2)
      })

      it('should create new client when server config changes', async () => {
        const server1 = createMockServer()

        await mcpClientService.getClient(server1)
        expect(Client).toHaveBeenCalledTimes(1)

        // Change headers - same id but different config
        const server2 = createMockServer({
          headers: { 'X-Custom': 'value' }
        })

        await mcpClientService.getClient(server2)
        expect(Client).toHaveBeenCalledTimes(2)
      })

      it('should deduplicate concurrent connection requests', async () => {
        const server = createMockServer()

        // Delay connect to simulate slow connection
        mockConnect.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 50)))

        // Start multiple connections concurrently
        const [client1, client2, client3] = await Promise.all([
          mcpClientService.getClient(server),
          mcpClientService.getClient(server),
          mcpClientService.getClient(server)
        ])

        expect(Client).toHaveBeenCalledTimes(1)
        expect(client1).toBe(client2)
        expect(client2).toBe(client3)
      })

      it('should throw error when baseUrl is not configured', async () => {
        const server = createMockServer({ baseUrl: undefined })

        await expect(mcpClientService.getClient(server)).rejects.toThrow('No baseUrl configured for server')
      })

      it('should pass headers to transport when configured', async () => {
        const headers = { Authorization: 'Bearer token', 'X-Custom': 'value' }
        const server = createMockServer({ headers })

        await mcpClientService.getClient(server)

        expect(RNStreamableHTTPClientTransport).toHaveBeenCalledWith(
          server.baseUrl,
          expect.objectContaining({
            requestInit: { headers }
          })
        )
      })

      it('should create OAuth provider for server', async () => {
        const server = createMockServer()

        await mcpClientService.getClient(server)

        expect(mockCreateMobileOAuthProvider).toHaveBeenCalledWith(server.baseUrl)
      })
    })

    describe('closeClient', () => {
      it('should close client and transport', async () => {
        const server = createMockServer()

        await mcpClientService.getClient(server)
        await mcpClientService.closeClient(server.id)

        expect(mockClose).toHaveBeenCalledTimes(1)
        expect(mockTransportClose).toHaveBeenCalledTimes(1)
      })

      it('should do nothing when client does not exist', async () => {
        await mcpClientService.closeClient('non-existent-id')

        expect(mockClose).not.toHaveBeenCalled()
      })

      it('should invalidate tools cache when closing client', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'test-tool', description: 'Test' }]
        })

        await mcpClientService.listTools(server)
        await mcpClientService.closeClient(server.id)

        // After closing, tools should be fetched again
        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'updated-tool', description: 'Updated' }]
        })

        const tools = await mcpClientService.listTools(server)
        expect(tools[0].name).toBe('updated-tool')
      })

      it('should handle errors during close gracefully', async () => {
        const server = createMockServer()

        await mcpClientService.getClient(server)

        mockClose.mockRejectedValueOnce(new Error('Close failed'))
        mockTransportClose.mockRejectedValueOnce(new Error('Transport close failed'))

        // Should not throw
        await expect(mcpClientService.closeClient(server.id)).resolves.not.toThrow()
      })
    })
  })

  // ==================== Tools Cache Tests ====================
  describe('Tools Cache', () => {
    describe('listTools', () => {
      it('should fetch tools from server', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValueOnce({
          tools: [
            { name: 'tool1', description: 'First tool', inputSchema: {} },
            { name: 'tool2', description: 'Second tool', inputSchema: {} }
          ]
        })

        const tools = await mcpClientService.listTools(server)

        expect(tools).toHaveLength(2)
        expect(tools[0].name).toBe('tool1')
        expect(tools[0].serverId).toBe(server.id)
        expect(tools[0].serverName).toBe(server.name)
        expect(tools[0].type).toBe('mcp')
        expect(tools[0].isBuiltIn).toBe(false)
      })

      it('should return cached tools within TTL', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'cached-tool', description: 'Cached', inputSchema: {} }]
        })

        await mcpClientService.listTools(server)
        const tools = await mcpClientService.listTools(server)

        // listTools should only be called once (second call uses cache)
        expect(mockListTools).toHaveBeenCalledTimes(1)
        expect(tools[0].name).toBe('cached-tool')
      })

      it('should refetch tools after cache expires', async () => {
        const server = createMockServer()

        const originalDateNow = Date.now
        let currentTime = 1000000

        Date.now = jest.fn(() => currentTime)

        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'old-tool', description: 'Old', inputSchema: {} }]
        })

        await mcpClientService.listTools(server)

        // Advance time beyond TTL (5 minutes = 300000ms)
        currentTime += 300001

        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'new-tool', description: 'New', inputSchema: {} }]
        })

        const tools = await mcpClientService.listTools(server)

        expect(mockListTools).toHaveBeenCalledTimes(2)
        expect(tools[0].name).toBe('new-tool')

        Date.now = originalDateNow
      })

      it('should return empty array for SSE servers', async () => {
        const server = createMockServer({ type: 'sse' })

        const tools = await mcpClientService.listTools(server)

        expect(tools).toEqual([])
        expect(Client).not.toHaveBeenCalled()
      })

      it('should throw error when listTools fails', async () => {
        const server = createMockServer()

        mockListTools.mockRejectedValueOnce(new Error('Network error'))

        await expect(mcpClientService.listTools(server)).rejects.toThrow('Network error')
      })

      it('should generate correct tool IDs', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValueOnce({
          tools: [{ name: 'my-tool', description: 'Test', inputSchema: {} }]
        })

        const tools = await mcpClientService.listTools(server)

        expect(tools[0].id).toBe(`mcp:${server.id}:my-tool`)
      })
    })

    describe('invalidateToolsCache', () => {
      it('should invalidate cache for specific server', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValue({
          tools: [{ name: 'tool', description: 'Test', inputSchema: {} }]
        })

        await mcpClientService.listTools(server)
        mcpClientService.invalidateToolsCache(server.id)
        await mcpClientService.listTools(server)

        expect(mockListTools).toHaveBeenCalledTimes(2)
      })
    })

    describe('invalidateAllToolsCaches', () => {
      it('should invalidate all caches', async () => {
        const server1 = createMockServer({ id: 'server-1' })
        const server2 = createMockServer({ id: 'server-2', baseUrl: 'https://other.com/mcp' })

        mockListTools.mockResolvedValue({
          tools: [{ name: 'tool', description: 'Test', inputSchema: {} }]
        })

        await mcpClientService.listTools(server1)
        await mcpClientService.listTools(server2)

        mcpClientService.invalidateAllToolsCaches()

        await mcpClientService.listTools(server1)
        await mcpClientService.listTools(server2)

        expect(mockListTools).toHaveBeenCalledTimes(4)
      })
    })
  })

  // ==================== Tool Execution Tests ====================
  describe('Tool Execution', () => {
    describe('callTool', () => {
      it('should call tool successfully', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'text', text: 'Success result' }]
        })

        const result = await mcpClientService.callTool(server, 'test-tool', { param: 'value' })

        expect(mockCallTool).toHaveBeenCalledWith({
          name: 'test-tool',
          arguments: { param: 'value' }
        })
        expect(result.isError).toBe(false)
        expect(result.content[0].text).toBe('Success result')
      })

      it('should handle tool error response', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: true,
          content: [{ type: 'text', text: 'Tool execution failed' }]
        })

        const result = await mcpClientService.callTool(server, 'failing-tool', {})

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toBe('Tool execution failed')
      })

      it('should handle exception during tool call', async () => {
        const server = createMockServer()

        mockCallTool.mockRejectedValueOnce(new Error('Connection lost'))

        const result = await mcpClientService.callTool(server, 'test-tool', {})

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Connection lost')
      })

      it('should return error for SSE servers', async () => {
        const server = createMockServer({ type: 'sse' })

        const result = await mcpClientService.callTool(server, 'test-tool', {})

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('SSE transport not yet supported')
      })

      it('should handle image content type', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }]
        })

        const result = await mcpClientService.callTool(server, 'image-tool', {})

        expect(result.content[0].type).toBe('image')
        expect(result.content[0].data).toBe('base64data')
        expect(result.content[0].mimeType).toBe('image/png')
      })

      it('should handle resource content type', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'resource', resource: { uri: 'file://test.txt' } }]
        })

        const result = await mcpClientService.callTool(server, 'resource-tool', {})

        expect(result.content[0].type).toBe('resource')
        expect(result.content[0].resource).toEqual({ uri: 'file://test.txt' })
      })

      it('should handle string content', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: false,
          content: ['Plain string response']
        })

        const result = await mcpClientService.callTool(server, 'string-tool', {})

        expect(result.content[0].type).toBe('text')
        expect(result.content[0].text).toBe('Plain string response')
      })

      it('should handle unknown content type by JSON stringifying', async () => {
        const server = createMockServer()

        mockCallTool.mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'unknown', data: 'test' }]
        })

        const result = await mcpClientService.callTool(server, 'unknown-tool', {})

        expect(result.content[0].type).toBe('text')
        expect(result.content[0].text).toContain('unknown')
      })
    })
  })

  // ==================== Connectivity Tests ====================
  describe('Connectivity', () => {
    describe('checkConnectivity', () => {
      it('should return connected: true when server is reachable', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValueOnce({ tools: [] })

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(true)
        expect(result.error).toBeUndefined()
        expect(result.errorCode).toBeUndefined()
      })

      it('should return connected: false with error details when server is unreachable', async () => {
        const server = createMockServer()

        // First call creates client successfully, then listTools fails
        mockListTools.mockRejectedValueOnce(new Error('Connection refused'))

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(false)
        expect(result.error).toBe('Connection refused')
        expect(result.errorCode).toBe('UNKNOWN')
      })

      it('should return AUTH_REQUIRED error code for 401 errors', async () => {
        const server = createMockServer()

        mockListTools.mockRejectedValueOnce(new Error('HTTP 401 Unauthorized'))

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(false)
        expect(result.errorCode).toBe('AUTH_REQUIRED')
      })

      it('should return TIMEOUT error code for timeout errors', async () => {
        const server = createMockServer()

        mockListTools.mockRejectedValueOnce(new Error('Request timeout'))

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(false)
        expect(result.errorCode).toBe('TIMEOUT')
      })

      it('should return NETWORK_ERROR error code for network errors', async () => {
        const server = createMockServer()

        mockListTools.mockRejectedValueOnce(new Error('Network error'))

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(false)
        expect(result.errorCode).toBe('NETWORK_ERROR')
      })

      it('should return SERVER_ERROR error code for 500 errors', async () => {
        const server = createMockServer()

        mockListTools.mockRejectedValueOnce(new Error('HTTP 500 Internal Server Error'))

        const result = await mcpClientService.checkConnectivity(server)

        expect(result.connected).toBe(false)
        expect(result.errorCode).toBe('SERVER_ERROR')
      })
    })
  })

  // ==================== OAuth Tests ====================
  describe('OAuth', () => {
    describe('triggerOAuth', () => {
      it('should return success: true when OAuth flow succeeds', async () => {
        const result = await mcpClientService.triggerOAuth('https://example.com/mcp')

        expect(mockPerformOAuthFlow).toHaveBeenCalledWith('https://example.com/mcp')
        expect(result.success).toBe(true)
        expect(result.error).toBeUndefined()
        expect(result.errorCode).toBeUndefined()
      })

      it('should return NO_URL error when no URL provided', async () => {
        const result = await mcpClientService.triggerOAuth('')

        expect(mockPerformOAuthFlow).not.toHaveBeenCalled()
        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('NO_URL')
      })

      it('should return USER_CANCELLED when OAuth flow returns false', async () => {
        mockPerformOAuthFlow.mockResolvedValueOnce(false)

        const result = await mcpClientService.triggerOAuth('https://example.com/mcp')

        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('USER_CANCELLED')
      })

      it('should return error details when OAuth flow throws', async () => {
        mockPerformOAuthFlow.mockRejectedValueOnce(new Error('OAuth discovery failed'))

        const result = await mcpClientService.triggerOAuth('https://example.com/mcp')

        expect(result.success).toBe(false)
        expect(result.error).toBe('OAuth discovery failed')
        expect(result.errorCode).toBe('DISCOVERY_FAILED')
      })

      it('should return STATE_MISMATCH for CSRF errors', async () => {
        mockPerformOAuthFlow.mockRejectedValueOnce(new Error('OAuth state mismatch - possible CSRF attack'))

        const result = await mcpClientService.triggerOAuth('https://example.com/mcp')

        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('STATE_MISMATCH')
      })

      it('should return TOKEN_EXCHANGE_FAILED for token errors', async () => {
        mockPerformOAuthFlow.mockRejectedValueOnce(new Error('Token exchange failed'))

        const result = await mcpClientService.triggerOAuth('https://example.com/mcp')

        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('TOKEN_EXCHANGE_FAILED')
      })
    })
  })

  // ==================== Cleanup Tests ====================
  describe('Cleanup', () => {
    describe('cleanup', () => {
      it('should close all clients', async () => {
        const server1 = createMockServer({ id: 'server-1' })
        const server2 = createMockServer({ id: 'server-2', baseUrl: 'https://other.com/mcp' })

        await mcpClientService.getClient(server1)
        await mcpClientService.getClient(server2)

        await mcpClientService.cleanup()

        expect(mockClose).toHaveBeenCalledTimes(2)
        expect(mockTransportClose).toHaveBeenCalledTimes(2)
      })

      it('should clear all caches', async () => {
        const server = createMockServer()

        mockListTools.mockResolvedValue({
          tools: [{ name: 'tool', description: 'Test', inputSchema: {} }]
        })

        await mcpClientService.listTools(server)
        await mcpClientService.cleanup()

        // After cleanup, tools should be fetched again
        await mcpClientService.listTools(server)

        expect(mockListTools).toHaveBeenCalledTimes(2)
      })

      it('should handle errors during cleanup gracefully', async () => {
        const server = createMockServer()

        await mcpClientService.getClient(server)

        mockClose.mockRejectedValueOnce(new Error('Close error'))

        await expect(mcpClientService.cleanup()).resolves.not.toThrow()
      })
    })
  })
})
