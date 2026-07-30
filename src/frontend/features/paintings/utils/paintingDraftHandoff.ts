import { createOrderedUuid } from '@/data/db/schemas/_columnHelpers';
import type { ChatInputAttachmentDraft } from '@/frontend/features/chat/input/utils/chatInputAttachments';

export type PaintingDraftHandoff = {
  attachments: readonly ChatInputAttachmentDraft[];
  draft?: string;
};

const handoffs = new Map<string, PaintingDraftHandoff>();

export function createPaintingDraftHandoff(payload: PaintingDraftHandoff): string {
  const token = createOrderedUuid();
  handoffs.set(token, {
    ...payload,
    attachments: payload.attachments.map((attachment) => ({ ...attachment })),
  });
  return token;
}

export function consumePaintingDraftHandoff(
  token: string | undefined,
): PaintingDraftHandoff | undefined {
  if (!token) {
    return undefined;
  }
  const payload = handoffs.get(token);
  handoffs.delete(token);
  return payload;
}
