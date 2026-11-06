import { File } from 'expo-file-system';

import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { readImageText } from './fileTextExtraction';
import type { ExtractedDocumentText } from './officeText';

export class ImageTextError extends Error {
  constructor(readonly failure: 'empty' | 'failed' | 'unsupported' | 'file-bytes' | 'unavailable') {
    super(failure);
    this.name = 'ImageTextError';
  }
}

/** The caller supplies a resolved managed image. Recognition never sends pixels to a provider. */
export async function readImageUriText(
  uri: string,
  signal: AbortSignal,
): Promise<ExtractedDocumentText> {
  signal.throwIfAborted();
  const source = new File(uri);
  if (!source.exists) throw new ImageTextError('unavailable');
  if (source.size > MAX_IMAGE_ATTACHMENT_BYTES) throw new ImageTextError('file-bytes');
  try {
    const result = await readImageText(source, signal);
    signal.throwIfAborted();
    if (result.ocrUnavailable) throw new ImageTextError('unsupported');
    if (result.extractionError || result.ocrError) throw new ImageTextError('failed');
    const text = result.text.trim();
    if (!text) throw new ImageTextError('empty');
    return { text, truncated: result.isTruncated };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ImageTextError) throw error;
    throw new ImageTextError('failed');
  }
}
