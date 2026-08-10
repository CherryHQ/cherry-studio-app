import type { ModelMessage, Tool } from 'ai';

import { emitToolRuntimeDiagnostic, type ToolRuntimeDiagnostics } from './types';

export async function isApprovalGated(
  tool: Tool,
  options: {
    input?: unknown;
    toolCallId?: string;
    toolName?: string;
    messages?: ModelMessage[];
    experimental_context?: unknown;
  } = {},
  diagnostics?: ToolRuntimeDiagnostics,
): Promise<boolean> {
  if (tool.needsApproval === undefined) {
    return false;
  }
  if (typeof tool.needsApproval === 'boolean') {
    return tool.needsApproval;
  }
  try {
    return await tool.needsApproval(options.input, {
      experimental_context: options.experimental_context,
      messages: options.messages ?? [],
      toolCallId: options.toolCallId ?? '',
    });
  } catch (error) {
    emitToolRuntimeDiagnostic(diagnostics, {
      code: 'approval-check-failed',
      error,
      toolName: options.toolName ?? '',
    });
    return true;
  }
}
