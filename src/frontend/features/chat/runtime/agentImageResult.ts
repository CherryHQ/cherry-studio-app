import type { AgentMessageView } from '@/shared/contracts/agent';

/** Only completed direct image-model turns can advance the composer's editing target. */
export function latestAgentImageResult(messages: readonly AgentMessageView[]) {
  let latest: AgentMessageView | undefined;
  for (const message of messages) {
    if (
      message.role !== 'assistant' ||
      message.status !== 'success' ||
      message.inferenceSnapshot?.status !== 'supported' ||
      !message.inferenceSnapshot.snapshot.imageGeneration ||
      !message.parts.some(
        (part) =>
          part.type === 'file' &&
          part.purpose === 'artifact' &&
          part.mediaType.startsWith('image/'),
      )
    )
      continue;
    if (
      !latest ||
      message.createdAt > latest.createdAt ||
      (message.createdAt === latest.createdAt && message.id > latest.id)
    )
      latest = message;
  }
  return latest;
}

/** Keeps image editing independent of the transcript's storage DTO. */
export function latestConversationImageResult(
  results: readonly (
    | import('@/frontend/appShell/conversation').ConversationImageResult
    | undefined
  )[],
) {
  return results.reduce<
    import('@/frontend/appShell/conversation').ConversationImageResult | undefined
  >(
    (latest, result) =>
      result &&
      (!latest ||
        result.createdAt > latest.createdAt ||
        (result.createdAt === latest.createdAt && result.id > latest.id))
        ? result
        : latest,
    undefined,
  );
}
