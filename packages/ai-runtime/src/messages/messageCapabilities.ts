/**
 * Capability-aware message shaping: drop media a model can't accept before it
 * reaches the provider.
 *
 * Image/video/audio support is model-intrinsic; native PDF support is additionally
 * provider-protocol-aware. Attachment pickers already gate *new* attachments by
 * capability, but history is replayed from the DB unfiltered, so switching to a
 * non-vision model and continuing would otherwise send unsupported media →
 * provider error.
 *
 * Ported from desktop's `src/main/ai/messages/messageCapabilities.ts`.
 */

import type { Model } from '@cherrystudio/universal/data/types/model';
import { isAudioModel, isVideoModel, isVisionModel } from '@cherrystudio/universal/utils/model';
import type { UIMessage } from 'ai';

export interface MediaCapabilities {
  image: boolean;
  video: boolean;
  audio: boolean;
  pdf?: boolean;
}

/** All-accepting — used as the safe default when capabilities are unknown. */
export const ALL_MEDIA: MediaCapabilities = { image: true, video: true, audio: true, pdf: true };

export function resolveMediaCapabilities(model: Model): MediaCapabilities {
  return { image: isVisionModel(model), video: isVideoModel(model), audio: isAudioModel(model) };
}

type GatedModality = keyof MediaCapabilities;

/** Native image/video/audio/PDF parts are gated; office and other files retain their current path. */
function gatedModality(mediaType: string): GatedModality | undefined {
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('audio/')) return 'audio';
  if (mediaType === 'application/pdf') return 'pdf';
  return undefined;
}

/** Return the provider-visible note for an unsupported media type. */
export function unsupportedMediaNote(
  mediaType: string,
  caps: MediaCapabilities,
): string | undefined {
  const modality = gatedModality(mediaType);
  return modality && caps[modality] === false
    ? `[${modality} attachment omitted: this model does not accept ${modality} input]`
    : undefined;
}

/**
 * Replace `file` parts whose modality the model can't accept with a text note.
 *
 * Replacing in place (vs. dropping) keeps the turn non-empty and tells the model
 * an attachment was there, without depending on the coalesce/empty-assistant
 * rules to clean up after a deletion. Office and other files retain their current
 * serialization path. Operates on UIMessages before conversion.
 */
export function stripUnsupportedMedia<T extends UIMessage = UIMessage>(
  messages: T[],
  caps: MediaCapabilities,
): T[] {
  return messages.map((message) => {
    if (!message.parts?.length) return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (part.type !== 'file') return part;
      const note = unsupportedMediaNote(part.mediaType, caps);
      if (!note) return part;
      changed = true;
      return { type: 'text', text: note };
    });
    return changed ? ({ ...message, parts } as T) : message;
  });
}
