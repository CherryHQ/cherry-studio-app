import { type AgentErrorView, AgentProtocolError } from '@/shared/contracts/agent';

/**
 * Submission rejections the composer can explain. The protocol `message` is
 * diagnostic text for logs; the label always comes from the closed `code`.
 * Codes absent here fall back to the composer's generic send failure.
 */
const SEND_ERROR_LABEL_KEYS: Partial<Record<AgentErrorView['code'], string>> = {
  AGENT_NOT_FOUND: 'chat.input.sendError.agentNotFound',
  ATTACHMENT_INVALID: 'chat.input.attachmentsRejected',
  ATTACHMENT_METADATA_MISMATCH: 'chat.input.attachmentUnavailable',
  ATTACHMENT_UNAVAILABLE: 'chat.input.attachmentUnavailable',
  CAPABILITY_UNSUPPORTED: 'chat.input.sendError.unsupported',
  EXECUTION_UNAVAILABLE: 'chat.input.sendError.executionUnavailable',
  SESSION_BUSY: 'chat.input.sendError.sessionBusy',
  SESSION_NOT_FOUND: 'chat.input.sendError.sessionNotFound',
  TOOL_CALLING_UNSUPPORTED: 'chat.input.sendError.toolCallingUnsupported',
};

export function getSendErrorLabelKey(error: unknown): string | undefined {
  if (!(error instanceof AgentProtocolError)) {
    return undefined;
  }
  return SEND_ERROR_LABEL_KEYS[error.view.code];
}
