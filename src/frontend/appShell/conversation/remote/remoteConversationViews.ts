import type { RemoteMessageView, RemoteSourceState } from '@/shared/contracts/remoteAgent';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { createUniqueModelId } from '@/shared/data/types/model';

import type {
  Availability,
  ConversationFailure,
  ConversationMessage,
  ResourceRead,
  TranscriptMessage,
} from '../contracts';

export function remoteConversationFailure(error: unknown): ConversationFailure {
  const failure = classifyRemoteFailure(error);
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const message =
      'detail' in error && typeof error.detail === 'string' ? error.detail : undefined;
    if (message) return { ...failure, detail: { code: error.code, message } };
  }
  return failure;
}

function classifyRemoteFailure(error: unknown): ConversationFailure {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'TARGET_UNAVAILABLE':
      return { code: 'target-unavailable', retry: 'revise-input' };
    case 'UPGRADE_REQUIRED':
      return { code: 'upgrade-required', retry: 'none' };
    case 'CLOSED':
      return { code: 'retired', retry: 'none' };
    case 'FORBIDDEN':
    case 'GRANT_REVOKED':
      return { code: 'not-authorized', retry: 'repair-source' };
    case 'UNAUTHENTICATED':
      return { code: 'needs-repair', retry: 'repair-source' };
    case 'REVISION_EXPIRED':
      return { code: 'version-expired', retry: 'read-again' };
    case 'NOT_FOUND':
      return { code: 'not-found', retry: 'read-again' };
    case 'CONFLICT':
      return { code: 'conflict', retry: 'read-again' };
    case 'IDEMPOTENCY_CONFLICT':
      return { code: 'idempotency-conflict', retry: 'none' };
    case 'RESOURCE_UNAVAILABLE':
      return { code: 'resource-unavailable', retry: 'none' };
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    return { code: 'cancelled', retry: 'none' };
  if (
    code === 'CONNECTION_LOST' ||
    (error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'DesktopUnreachableError')
  )
    return { code: 'offline', retry: 'read-again' };
  return { code: 'internal', retry: 'none' };
}
export function remoteAvailability(source: RemoteSourceState, disposed: boolean): Availability {
  if (!disposed && source.status !== 'retired' && source.reason === 'upgrade-required')
    return { state: 'disabled', reason: 'upgrade-required' };
  if (disposed || source.status === 'retired')
    return {
      state: 'disabled',
      reason:
        source.reason === 'needs-repair'
          ? 'needs-repair'
          : source.reason === 'not-authorized'
            ? 'not-authorized'
            : 'retired',
    };
  return source.status === 'ready'
    ? { state: 'enabled' }
    : {
        state: 'disabled',
        reason: source.status === 'connecting' ? 'synchronizing' : source.status,
      };
}
export function remoteMessage(
  message: RemoteMessageView,
  resource: (value: string) => ResourceRead,
): ConversationMessage {
  const parts: CherryMessagePart[] = [];
  const keys: string[] = [];
  const tools: NonNullable<ConversationMessage['tools']>[number][] = [];
  const attachments: NonNullable<ConversationMessage['attachments']>[number][] = [];
  for (const part of message.parts) {
    if (part.kind === 'text' || part.kind === 'reasoning') {
      parts.push({
        type: part.kind,
        text: part.text,
        state: message.state === 'streaming' ? 'streaming' : 'done',
      });
      keys.push(part.id);
    } else if (part.kind === 'tool') {
      const base = {
        type: 'dynamic-tool' as const,
        toolCallId: part.callId,
        toolName: part.name,
        input: undefined,
      };
      parts.push(
        part.state === 'failed'
          ? { ...base, state: 'output-error', errorText: '' }
          : part.output
            ? { ...base, state: 'output-available', output: undefined }
            : {
                ...base,
                state: part.state === 'streaming' ? 'input-streaming' : 'input-available',
              },
      );
      keys.push(part.id);
      tools.push({
        key: part.callId,
        title: part.name,
        state: part.state,
        ...(part.input ? { input: resource(part.input) } : {}),
        ...(part.output ? { output: resource(part.output) } : {}),
      });
    } else if (part.kind === 'file')
      attachments.push({ key: part.id, name: part.name, mediaType: part.mediaType });
  }
  if (message.failure) {
    parts.push({
      type: 'data-error',
      data: {
        code: 'EXECUTION_FAILED',
        message: message.failure.message,
        retryable: message.failure.retryable,
        ...message.failure.failure,
      },
    });
    keys.push(`${message.id}:failure`);
  }
  if (message.persistenceFailure) {
    parts.push({
      type: 'data-error',
      data: {
        code: 'PERSISTENCE_FAILED',
        message: message.persistenceFailure.message,
        retryable: false,
        ...message.persistenceFailure.failure,
      },
    });
    keys.push(`${message.id}:persistence-failure`);
  }
  return {
    key: message.id,
    state: message.state,
    completeness: message.parts.some(
      (part) => (part.kind === 'text' || part.kind === 'reasoning') && !part.complete,
    )
      ? 'partial'
      : 'complete',
    display: {
      id: message.id,
      usage: message.usage,
      ...(message.model
        ? {
            model: {
              ...message.model,
              id: createUniqueModelId(message.model.providerId, message.model.modelId),
            },
          }
        : {}),
      role: message.role,
      status:
        message.state === 'streaming'
          ? 'pending'
          : message.state === 'cancelled'
            ? 'paused'
            : message.state,
      data: { parts, partKeys: keys },
    },
    actions: {},
    tools,
    attachments,
  };
}
export function remoteTranscriptMessage(message: RemoteMessageView): TranscriptMessage {
  const parts: TranscriptMessage['parts'] = [];
  const attachments: NonNullable<TranscriptMessage['attachments']>[number][] = [];
  for (const part of message.parts) {
    if (part.kind === 'text' || part.kind === 'reasoning') {
      if (!part.complete) throw new Error('Incomplete transcript content');
      parts.push({ type: part.kind, id: part.id, text: part.text, state: 'done' });
    } else if (part.kind === 'tool')
      parts.push({ type: 'tool-summary', id: part.id, displayName: part.name });
    else if (part.kind === 'file') attachments.push({ name: part.name, mediaType: part.mediaType });
  }
  if (message.failure)
    parts.push({
      id: `${message.id}:failure`,
      type: 'error',
      error: { code: 'EXECUTION_FAILED', ...message.failure },
    });
  return {
    id: message.id,
    role: message.role,
    status: message.state,
    parts,
    attachments,
    stats: null,
  };
}
