import {
  getToolUiResourceUri,
  McpUiToolMetaSchema,
} from '@modelcontextprotocol/ext-apps/app-bridge';

export function mcpToolVisible(
  tool: { _meta?: Record<string, unknown> },
  audience: 'model' | 'app',
): boolean {
  const ui = tool._meta?.ui;
  if (ui === undefined) return true;
  const parsed = McpUiToolMetaSchema.safeParse(ui);
  return parsed.success && (parsed.data.visibility ?? ['model', 'app']).includes(audience);
}
export function mcpToolAppUri(tool: { _meta?: Record<string, unknown> }): string | undefined {
  try {
    if (tool._meta?.ui !== undefined && !McpUiToolMetaSchema.safeParse(tool._meta.ui).success)
      return undefined;
    const uri = getToolUiResourceUri(tool);
    return uri?.startsWith('ui://') && uri.length <= 8192 ? uri : undefined;
  } catch {
    return undefined;
  }
}
