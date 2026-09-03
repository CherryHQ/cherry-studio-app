import * as Crypto from 'expo-crypto';

import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';
import type { ImageParamDraft } from '@/frontend/data/paintings/imageGenerationParams';

export type PaintingDraftHandoff = {
  attachments: readonly ComposerInitialAttachment[];
  draft?: string;
  paramValues?: ImageParamDraft;
};

const handoffs = new Map<string, PaintingDraftHandoff>();

export function createPaintingDraftHandoff(payload: PaintingDraftHandoff): string {
  const token = Crypto.randomUUID();
  handoffs.set(token, {
    ...payload,
    attachments: payload.attachments.map((attachment) => ({ ...attachment })),
    ...(payload.paramValues ? { paramValues: { ...payload.paramValues } } : {}),
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
