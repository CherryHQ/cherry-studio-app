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
    disabledTools: dbRecord.disabled_tools ? safeJsonParse(dbRecord.disabled_tools) : undefined,
    // External MCP server fields
    baseUrl: dbRecord.base_url ?? undefined,
    headers: dbRecord.headers ? safeJsonParse(dbRecord.headers) : undefined,
    timeout: dbRecord.timeout ?? undefined,
    provider: dbRecord.provider ?? undefined,
    providerUrl: dbRecord.provider_url ?? undefined,
    logoUrl: dbRecord.logo_url ?? undefined,
    tags: dbRecord.tags ? safeJsonParse(dbRecord.tags) : undefined,
    reference: dbRecord.reference ?? undefined,
    disabledAutoApproveTools: dbRecord.disabled_auto_approve_tools
      ? safeJsonParse(dbRecord.disabled_auto_approve_tools)
      : undefined,
    isTrusted: dbRecord.is_trusted ?? undefined,
    trustedAt: dbRecord.trusted_at ?? undefined,
    installedAt: dbRecord.installed_at ?? undefined
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
    name: mcpServer.name || mcpServer.id,
    type: mcpServer.type || 'stdio',
    description: mcpServer.description ?? null,
    is_active: mcpServer.isActive ? 1 : 0,
    disabled_tools: JSON.stringify(mcpServer.disabledTools || []),
    // External MCP server fields
    base_url: mcpServer.baseUrl ?? null,
    headers: mcpServer.headers ? JSON.stringify(mcpServer.headers) : null,
    timeout: mcpServer.timeout ?? null,
    provider: mcpServer.provider ?? null,
    provider_url: mcpServer.providerUrl ?? null,
    logo_url: mcpServer.logoUrl ?? null,
    tags: mcpServer.tags ? JSON.stringify(mcpServer.tags) : null,
    reference: mcpServer.reference ?? null,
    disabled_auto_approve_tools: mcpServer.disabledAutoApproveTools
      ? JSON.stringify(mcpServer.disabledAutoApproveTools)
      : null,
    is_trusted: mcpServer.isTrusted ?? null,
    trusted_at: mcpServer.trustedAt ?? null,
    installed_at: mcpServer.installedAt ?? null
  }
}
