import type { ConversationImageResult } from '@/frontend/appShell/conversation';
import type { AgentMessageView } from '@/shared/contracts/agent';

export function localImageResult(message: AgentMessageView): ConversationImageResult | undefined {
  if (
    message.role !== 'assistant' ||
    message.status !== 'success' ||
    message.inferenceSnapshot?.status !== 'supported' ||
    !message.inferenceSnapshot.snapshot.imageGeneration
  )
    return undefined;
  const images = message.parts.flatMap((part) =>
    part.type === 'file' && part.purpose === 'artifact' && part.mediaType.startsWith('image/')
      ? [
          {
            fileEntryId: part.fileEntryId,
            mediaType: part.mediaType,
            name: part.name ?? part.fileEntryId,
          },
        ]
      : [],
  );
  return images.length
    ? { id: message.id, sessionId: message.sessionId, createdAt: message.createdAt, images }
    : undefined;
}
