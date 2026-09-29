import type { ConversationFailure } from '@/frontend/appShell/conversation';

export class ConversationActionError extends Error {
  constructor(readonly failure: ConversationFailure) {
    super(failure.code);
    this.name = 'ConversationActionError';
  }
}

export function conversationFailureKey(failure: ConversationFailure) {
  switch (failure.code) {
    case 'target-unavailable':
      return 'remoteAgent.targetUnavailable';
    case 'conflict':
    case 'version-expired':
      return 'remoteAgent.actionConflict';
    case 'not-found':
      return 'remoteAgent.targetNotFound';
    case 'not-authorized':
    case 'needs-repair':
    case 'retired':
      return 'remoteAgent.pairAgain';
    case 'offline':
      return 'remoteAgent.disconnected';
    case 'upgrade-required':
      return 'remoteAgent.upgradeRequired';
    default:
      return 'remoteAgent.responseError';
  }
}
