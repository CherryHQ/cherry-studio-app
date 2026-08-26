import type { RuntimeModelPreflight } from '@/backend/ai/agent';
import { AI_IMAGE_INPUT_MAX_COUNT } from '@/shared/utils/imageFileTypes';

import type { ManagedFileFact } from './managedFileResolver';

/** Matches the Composer photo selection ceiling and bounds provider payload fan-out. */
export const MAX_IMAGE_ATTACHMENT_COUNT = AI_IMAGE_INPUT_MAX_COUNT;
export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

/**
 * A provider-independent Host admission ceiling retained alongside S2b's image-aware Pi
 * compression-trigger estimate. Image tokenization is endpoint-specific, so A2 uses a conservative
 * fixed charge and leaves enough input capacity for instructions and text.
 */
export const IMAGE_CONTEXT_TOKEN_RESERVE = 4_096;
export const MIN_TEXT_CONTEXT_TOKEN_RESERVE = 1_024;

export type ImageAttachmentLimit = 'count' | 'file-bytes' | 'total-bytes' | 'context';

export function findImageAttachmentLimit(
  files: readonly ManagedFileFact[],
  model: RuntimeModelPreflight,
): ImageAttachmentLimit | null {
  if (files.length > MAX_IMAGE_ATTACHMENT_COUNT) {
    return 'count';
  }
  if (files.some((file) => file.size > MAX_IMAGE_ATTACHMENT_BYTES)) {
    return 'file-bytes';
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_ATTACHMENT_TOTAL_BYTES) {
    return 'total-bytes';
  }
  if (
    MIN_TEXT_CONTEXT_TOKEN_RESERVE + files.length * IMAGE_CONTEXT_TOKEN_RESERVE >
    model.maxInputTokens
  ) {
    return 'context';
  }
  return null;
}
