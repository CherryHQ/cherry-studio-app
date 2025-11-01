import {
  deleteMcpById as _deleteMcpById,
  getMcpById as _getMcpById,
  getMcps as _getMcps,
  upsertMcps as _upsertMcps
} from '@db/queries/mcp.queries'

import type { MCPServer } from '@/types/mcp'

export async function upsertMcps(servers: MCPServer[]) {
  return _upsertMcps(servers)
}

export async function getMcps() {
  return _getMcps()
}

export async function getMcpById(id: string) {
  return _getMcpById(id)
}

export async function deleteMcpById(id: string) {
  return _deleteMcpById(id)
}

export const mcpDatabase = {
  upsertMcps,
  getMcps,
  getMcpById,
  deleteMcpById
}
