import type { MCPServer } from '@/types/mcp'
import { safeJsonParse } from '@/utils/json'

/**
 * 将数据库记录转换为 MCPServer 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 MCPServer 对象。
 */
export function transformDbToMcp(dbRecord: any): MCPServer {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    type: dbRecord.type,
    description: dbRecord.description,
    isActive: !!dbRecord.is_active,
    disabledTools: dbRecord.disabled_tools ? safeJsonParse(dbRecord.disabled_tools) : undefined
  }
}

/**
 * 将 MCPServer 对象转换为数据库记录格式。
 * @param mcpServer - MCPServer 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformMcpToDb(mcpServer: MCPServer): any {
  return {
    id: mcpServer.id,
    name: mcpServer.name,
    type: mcpServer.type || 'stdio',
    description: mcpServer.description || null,
    is_active: mcpServer.isActive ? 1 : 0,
    disabled_tools: JSON.stringify(mcpServer.disabledTools || [])
  }
}
