import type { ModelMessage, Tool } from 'ai';

import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('ToolApprovalGate');

export async function isApprovalGated(
  tool: Tool,
  options: {
    input?: unknown;
    toolCallId?: string;
    messages?: ModelMessage[];
    experimental_context?: unknown;
  } = {},
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
    logger.warn('Approval lookup failed; treating tool as approval-gated', { error });
    return true;
  }
}
