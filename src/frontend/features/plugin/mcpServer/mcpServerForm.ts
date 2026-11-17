import type { McpServerInfo } from '@/shared/contracts/mcp';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

/** A user-chosen local name takes precedence over remote discovery metadata. */
export function resolveMcpServerName(
  name: string,
  serverInfo: McpServerInfo,
  fallbackName: string,
): string {
  return name.trim() || serverInfo.title?.trim() || serverInfo.name.trim() || fallbackName;
}

/** Only closed error facts decide inline copy; diagnostic messages stay private. */
export function getMcpServerSaveErrorKey(error: unknown) {
  if (error instanceof DataApiError && error.code === ErrorCode.CONFLICT) {
    return error.details?.resource === 'McpServer' && error.details.field === 'name'
      ? 'settings.mcp.toast.nameConflict'
      : 'settings.mcp.toast.saveConflict';
  }
  return 'settings.mcp.toast.saveFailed';
}
