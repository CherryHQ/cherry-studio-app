import type { ToolRuntimeDiagnostics } from '@cherrystudio/ai-runtime/tools';

import { loggerService } from '@/shared/core/logger/LoggerService';

const approvalLogger = loggerService.withContext('ToolApprovalGate');
const registryLogger = loggerService.withContext('ToolRegistry');
const repairLogger = loggerService.withContext('ToolCallRepair');

export const reportToolRuntimeDiagnostic: ToolRuntimeDiagnostics = ({ code, error, toolName }) => {
  if (code === 'approval-check-failed') {
    approvalLogger.warn('Approval lookup failed; treating tool as approval-gated', { error });
  } else if (code === 'tool-materialization-failed') {
    registryLogger.warn('Tool request materialization failed; treating it as inactive', {
      error,
      toolName,
    });
  } else {
    repairLogger.warn('Tool call repair failed', { error, toolName });
  }
};
