import { createOrderedUuid } from '@/data/db/schemas/_columnHelpers';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

const handoffs = new Map<string, readonly ChatInputAttachmentDraft[]>();

export function createPaintingDraftHandoff(
  attachments: readonly ChatInputAttachmentDraft[],
): string {
  const token = createOrderedUuid();
  handoffs.set(
    token,
    attachments.map((attachment) => ({ ...attachment })),
  );
  return token;
}

export function consumePaintingDraftHandoff(
  token: string | undefined,
): readonly ChatInputAttachmentDraft[] {
  if (!token) {
    return [];
  }
  const attachments = handoffs.get(token) ?? [];
  handoffs.delete(token);
  return attachments;
}
