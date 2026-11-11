import { Directory, File, FileMode } from 'expo-file-system';
import { strFromU8 } from 'fflate/browser';

import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  AiContentSchema,
  inheritAiContent,
  type AiContent,
  type AiContentLabel,
  type AiContentOperation,
} from '@/shared/data/types/aiContent';
import { readAiContentText, writeAiContentText } from '@/shared/utils/aiContentText';

import { imageMetadata, type ImageMetadataSource } from './imageMetadata';
import { decodeManagedUtf8 } from './utf8Text';
import { MAX_AI_METADATA_BYTES } from './xmpMetadata';

export type AiContentWrite = {
  aiContent?: AiContent | null;
  /** Set by a producing business path, never inferred from file provenance. */
  aiOperation?: AiContentOperation;
};

const IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const OFFICE: Record<string, 'docx' | 'xlsx' | 'pptx'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

export function createGeneratedAiContent(): AiContent {
  // Local file/artifact IDs belong to Cherry. They are never upstream production IDs.
  return { version: 1, source: 'generated', label: null };
}

function imageSource(file: File) {
  const handle = file.open(FileMode.ReadOnly);
  const source: ImageMetadataSource = {
    size: file.size,
    read(offset, length) {
      handle.offset = offset;
      return handle.readBytesSync(length);
    },
  };
  return { source, close: () => handle.close() };
}

export async function readFileAiContent(
  file: { uri: string; mediaType: string },
  signal?: AbortSignal,
): Promise<AiContent | null> {
  signal?.throwIfAborted();
  const source = new File(file.uri);
  const mediaType = file.mediaType.split(';')[0].trim().toLowerCase();
  let label: AiContentLabel | null = null;
  if (IMAGES.has(mediaType)) {
    const reader = imageSource(source);
    try {
      label = imageMetadata(reader.source, mediaType).label;
    } finally {
      reader.close();
    }
  } else if (mediaType === 'text/markdown' || mediaType === 'text/html') {
    const handle = source.open(FileMode.ReadOnly);
    try {
      // Only header carriers are inspected; importing a large text file never loads its body.
      label = readAiContentText(
        strFromU8(handle.readBytesSync(Math.min(source.size, MAX_AI_METADATA_BYTES))),
        mediaType,
      );
    } finally {
      handle.close();
    }
  } else if (OFFICE[mediaType]) {
    const { processOfficeMetadata } = await import('@/backend/services/office');
    label = (
      await processOfficeMetadata({
        uri: source.uri,
        size: source.size,
        format: OFFICE[mediaType],
        signal,
      })
    ).label;
  }
  signal?.throwIfAborted();
  return label ? inheritAiContent(label) : null;
}

/** Capture source declarations before a mechanical encode; unknown files keep their behavior. */
export async function readSourceAiContent(
  file: { uri: string; mediaType: string; aiContent?: AiContent | null },
  signal?: AbortSignal,
): Promise<AiContent | null> {
  signal?.throwIfAborted();
  if (file.aiContent) return AiContentSchema.parse(file.aiContent);
  try {
    return await readFileAiContent(file, signal);
  } catch (error) {
    signal?.throwIfAborted();
    loggerService
      .withContext('aiContentMetadata')
      .warn('Could not read source metadata', error as Error);
    return null;
  }
}

/** Only pending outputs are writable; callers own their publication and rollback. */
export async function completeFileAiContent(
  input: { uri: string; mediaType: string } & AiContentWrite,
  signal?: AbortSignal,
): Promise<AiContent | null> {
  signal?.throwIfAborted();
  const mediaType = input.mediaType.split(';')[0].trim().toLowerCase();
  const supported =
    IMAGES.has(mediaType) ||
    Boolean(OFFICE[mediaType]) ||
    mediaType === 'text/markdown' ||
    mediaType === 'text/html';
  const file = new File(input.uri);
  let content = input.aiContent ? AiContentSchema.parse(input.aiContent) : null;
  let existing: AiContent | null = null;
  if (
    supported &&
    (!input.aiOperation || (input.aiOperation === 'generate' && !content && IMAGES.has(mediaType)))
  ) {
    existing =
      input.aiOperation || content
        ? await readFileAiContent({ uri: file.uri, mediaType }, signal)
        : await readSourceAiContent({ uri: file.uri, mediaType }, signal);
  }
  if (input.aiOperation) {
    // Only original model-image responses may retain an upstream declaration for this output.
    content =
      input.aiOperation === 'generate' && !content && IMAGES.has(mediaType) && existing?.label
        ? existing
        : createGeneratedAiContent();
  } else content ??= existing;
  if (!content || !supported || (!input.aiOperation && !content.label)) return content;
  const label = content.label;
  if (label && JSON.stringify(existing?.label) === JSON.stringify(label)) return content;
  // A new AI edit cannot keep an old producer's declaration. Clear it on the pending output
  // when no declaration for the new content is available; retain the AI-origin fact internally.
  const temporary = new File(
    new Directory(file.parentDirectory.uri),
    createOrderedUuid() + '.metadata',
  );
  try {
    if (IMAGES.has(mediaType)) {
      const reader = imageSource(file);
      let output: ReturnType<File['open']> | undefined;
      try {
        const { parts } = imageMetadata(reader.source, mediaType, label);
        temporary.create();
        output = temporary.open(FileMode.WriteOnly);
        for (const part of parts) {
          signal?.throwIfAborted();
          if (part instanceof Uint8Array) output.writeBytesSync(part);
          else {
            for (let position = 0; position < part.length; position += 64 * 1024) {
              signal?.throwIfAborted();
              output.writeBytesSync(
                reader.source.read(
                  part.offset + position,
                  Math.min(64 * 1024, part.length - position),
                ),
              );
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
          }
        }
      } finally {
        output?.close();
        reader.close();
      }
    } else if (OFFICE[mediaType]) {
      const { processOfficeMetadata } = await import('@/backend/services/office');
      await processOfficeMetadata({
        uri: file.uri,
        size: file.size,
        format: OFFICE[mediaType],
        output: temporary.uri,
        label,
        signal,
      });
    } else {
      const { text, hasBom } = decodeManagedUtf8(await file.bytes(), file.size);
      temporary.writeSync(writeAiContentText((hasBom ? '\uFEFF' : '') + text, mediaType, label));
    }
    signal?.throwIfAborted();
    const extracted = await readFileAiContent({ uri: temporary.uri, mediaType }, signal);
    if (JSON.stringify(extracted?.label ?? null) !== JSON.stringify(label))
      throw new Error('AI content metadata did not round-trip');
    await temporary.copy(file, { overwrite: true });
    signal?.throwIfAborted();
    const published = await readFileAiContent({ uri: file.uri, mediaType }, signal);
    if (JSON.stringify(published?.label ?? null) !== JSON.stringify(label))
      throw new Error('Final file AI metadata did not round-trip');
    return content;
  } finally {
    if (temporary.exists) temporary.delete();
  }
}
