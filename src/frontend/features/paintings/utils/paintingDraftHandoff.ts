import * as Crypto from 'expo-crypto';

import type { ComposerInitialAttachment } from '@/frontend/components/composer/utils/composerAttachments';

export type PaintingDraftHandoff = {
  attachments: readonly ComposerInitialAttachment[];
  draft?: string;
};

const handoffs = new Map<string, PaintingDraftHandoff>();

export function createPaintingDraftHandoff(payload: PaintingDraftHandoff): string {
  const token = Crypto.randomUUID();
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
