import { AgentProtocolError } from '@/shared/contracts/agent';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import type { ConversationFailure } from '../contracts';
import { ConversationReadError } from '../conversationState';

export function localConversationFailure(error: unknown): ConversationFailure {
  if (error instanceof ConversationReadError) return error.failure;
  if (error instanceof AgentProtocolError) {
    const detail = { code: error.view.code };
    switch (error.view.code) {
      case 'SESSION_BUSY':
        return { detail, code: 'conflict', retry: 'read-again' };
      case 'AGENT_NOT_FOUND':
      case 'SESSION_NOT_FOUND':
      case 'MESSAGE_NOT_FOUND':
      case 'APPROVAL_NOT_FOUND':
        return { detail, code: 'not-found', retry: 'read-again' };
      case 'AGENT_MODEL_NOT_CONFIGURED':
      case 'ATTACHMENT_INVALID':
      case 'ATTACHMENT_NO_TEXT':
      case 'ATTACHMENT_METADATA_MISMATCH':
        return { detail, code: 'invalid-input', retry: 'revise-input' };
      case 'EXECUTION_UNAVAILABLE':
        return { detail, code: 'target-unavailable', retry: 'read-again' };
      case 'INTERRUPTED':
        return { detail, code: 'cancelled', retry: 'none' };
      case 'CAPABILITY_UNSUPPORTED':
      case 'TOOL_CALLING_UNSUPPORTED':
        return { detail, code: 'unsupported', retry: 'none' };
      case 'CANCELLED':
        return { detail, code: 'cancelled', retry: 'none' };
      case 'ATTACHMENT_UNAVAILABLE':
        return { detail, code: 'resource-unavailable', retry: 'revise-input' };
    }
  }
  if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND)
    return { code: 'not-found', retry: 'read-again' };
  if (error instanceof Error && error.name === 'AbortError')
    return { code: 'cancelled', retry: 'none' };
  return { code: 'internal', retry: 'none' };
}
