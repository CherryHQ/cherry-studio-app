import { Directory, File, FileMode } from 'expo-file-system';
import { strFromU8 } from 'fflate/browser';

import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  AiContentLabelSchema,
  type AiContentLabel,
  type AiContentOperation,
} from '@/shared/data/types/aiContent';
import { GENERATED_FILE_AUTHOR } from '@/shared/data/types/file';
import {
  aiContentTextType,
  readAiContentHtml,
  readAiContentText,
  writeAiContentText,
} from '@/shared/utils/aiContentText';

import { imageMetadata, type ImageMetadataSource } from './imageMetadata';
import { decodeManagedUtf8 } from './utf8Text';
import { MAX_AI_METADATA_BYTES } from './xmpMetadata';

export type AiContentWrite = {
  /** Captured from source bytes before a mechanical encode; never persisted. */
  aiContentLabel?: AiContentLabel | null;
  /** Set by a producing business path, never inferred from file provenance. */
  aiOperation?: AiContentOperation;
};

const IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/** Application generation-service name; not a model vendor or registration code. */
const CONTENT_PRODUCER = 'CherryStudio';
const OFFICE: Record<string, 'docx' | 'xlsx' | 'pptx'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

function createApplicationLabel(): AiContentLabel {
  const contentId = createOrderedUuid();
  return AiContentLabelSchema.parse({
    Label: '1',
    ContentProducer: CONTENT_PRODUCER,
    ProduceID: contentId,
    ReservedCode1: '',
    ContentPropagator: CONTENT_PRODUCER,
    PropagateID: contentId,
    ReservedCode2: '',
  });
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
): Promise<AiContentLabel | null> {
  signal?.throwIfAborted();
  const source = new File(file.uri);
  const mediaType = file.mediaType.split(';')[0].trim().toLowerCase();
  const textType = aiContentTextType(mediaType);
  let label: AiContentLabel | null = null;
  if (IMAGES.has(mediaType)) {
    const reader = imageSource(source);
    try {
      label = imageMetadata(reader.source, mediaType).label;
    } finally {
      reader.close();
    }
  } else if (textType === 'text/markdown') {
    const handle = source.open(FileMode.ReadOnly);
    try {
      // Only header carriers are inspected; importing a large text file never loads its body.
      label = readAiContentText(
        strFromU8(handle.readBytesSync(Math.min(source.size, MAX_AI_METADATA_BYTES))),
        textType,
      );
    } finally {
      handle.close();
    }
  } else if (textType === 'text/html') {
    const handle = source.open(FileMode.ReadOnly);
    function* chunks() {
      let remaining = source.size;
      while (remaining > 0) {
        signal?.throwIfAborted();
        const bytes = handle.readBytesSync(Math.min(64 * 1024, remaining));
        if (!bytes.length) throw new Error('Truncated HTML metadata source');
        remaining -= bytes.length;
        // Carrier syntax and field values are ASCII; preserve its delimiters across UTF-8 chunks.
        yield strFromU8(bytes, true);
      }
    }
    try {
      label = readAiContentHtml(chunks());
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
  return label;
}

/** Capture source declarations before a mechanical encode; unknown files keep their behavior. */
export async function readSourceAiContent(
  file: { uri: string; mediaType: string },
  signal?: AbortSignal,
): Promise<AiContentLabel | null> {
  signal?.throwIfAborted();
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
): Promise<AiContentLabel | null> {
  signal?.throwIfAborted();
  const mediaType = input.mediaType.split(';')[0].trim().toLowerCase();
  const textType = aiContentTextType(mediaType);
  const supported = IMAGES.has(mediaType) || Boolean(OFFICE[mediaType]) || Boolean(textType);
  let label = input.aiContentLabel ? AiContentLabelSchema.parse(input.aiContentLabel) : null;
  if (!supported) return label;
  const file = new File(input.uri);
  const isOriginalModelImage =
    input.aiOperation === 'generate' && input.aiContentLabel === undefined && IMAGES.has(mediaType);
  let existing: AiContentLabel | null = null;
  if (input.aiContentLabel !== null && (!input.aiOperation || isOriginalModelImage)) {
    existing =
      input.aiOperation || label
        ? await readFileAiContent({ uri: file.uri, mediaType }, signal)
        : await readSourceAiContent({ uri: file.uri, mediaType }, signal);
  }
  if (input.aiOperation) {
    // Only original model-image responses may establish upstream identity for this output.
    // All other AI writes declare this application's service with a fresh content number.
    label = (isOriginalModelImage && existing) || createApplicationLabel();
  } else if (input.aiContentLabel === undefined) label = existing;
  if (!label) return null;
  if (JSON.stringify(existing) === JSON.stringify(label)) return label;
  const author = input.aiOperation
    ? { name: GENERATED_FILE_AUTHOR, replace: input.aiOperation === 'generate' }
    : undefined;
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
        author,
        signal,
      });
    } else {
      const { text, hasBom } = decodeManagedUtf8(await file.bytes(), file.size);
      let content = (hasBom ? '\uFEFF' : '') + text;
      if (input.aiOperation) content = writeAiContentText(content, mediaType, null);
      temporary.writeSync(writeAiContentText(content, mediaType, label, author));
    }
    signal?.throwIfAborted();
    const extracted = await readFileAiContent({ uri: temporary.uri, mediaType }, signal);
    if (JSON.stringify(extracted) !== JSON.stringify(label))
      throw new Error('AI content metadata did not round-trip');
    await temporary.copy(file, { overwrite: true });
    signal?.throwIfAborted();
    const published = await readFileAiContent({ uri: file.uri, mediaType }, signal);
    if (JSON.stringify(published) !== JSON.stringify(label))
      throw new Error('Final file AI metadata did not round-trip');
    return label;
  } finally {
    if (temporary.exists) temporary.delete();
  }
}
