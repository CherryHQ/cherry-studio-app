import {
  OfficeGenerationError,
  OFFICE_MAX_FILE_BYTES,
  OFFICE_MAX_IMAGES,
  type OfficeImage,
} from '@/backend/services/office';
import { createConcurrencySlots } from '@/backend/utils/concurrencySlots';
import { FileEntryIdSchema, filenameExtension, SafeNameSchema } from '@/shared/data/types/file';
import type { FileEntry, FileEntryProvenance } from '@/shared/data/types/file';
import type { FilePlacement } from '@/shared/data/types/fileLibrary';

import type { ManagedFileFact, ManagedFileResolver } from '../resources/managedFileResolver';
import type { RuntimeToolResult } from '../runtime';

/** Office jobs read and write local files natively; bytes never pass through this runtime. */
export type OfficeFiles = Pick<ManagedFileResolver, 'resolveAvailable'> & {
  /** Host-only device URI of an available managed file. */
  localUri(file: ManagedFileFact): string | undefined;
  /** A temporary PNG/JPEG copy for embedding, or undefined to embed the original. */
  prepareImage(file: ManagedFileFact): Promise<{ uri: string; mediaType: string } | undefined>;
  /** Byte size of a local file, or undefined when it is missing. */
  size(uri: string): number | undefined;
  hash(uri: string, signal: AbortSignal): Promise<string>;
  /** A fresh location for a temporary file. */
  temporaryUri(extension: string): string;
  /** Deletes a temporary file if it exists. */
  discard(uri: string): void;
  /** Copies a finished local file into managed storage. */
  createFileEntry(
    input: FilePlacement & {
      uri: string;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

export type OfficeOperation = Awaited<ReturnType<typeof startOfficeOperation>>;

// Image preparation, native compute and publication share a bounded lifetime.
const officeOperationSlots = createConcurrencySlots(2);

export const mebibytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

/**
 * Holds an operation slot and the call's temporary files until both the call and its native job
 * have finished: a cancelled call returns while the job may still read and write those files.
 */
export async function startOfficeOperation(
  files: Pick<OfficeFiles, 'temporaryUri' | 'discard'>,
  signal: AbortSignal,
) {
  const release = await officeOperationSlots.acquire(signal);
  const uris: string[] = [];
  let running = false;
  let finished = false;
  let released = false;
  const settle = () => {
    if (finished && !running && !released) {
      released = true;
      for (const uri of uris) files.discard(uri);
      release();
    }
  };
  return {
    add(uri: string): string {
      uris.push(uri);
      return uri;
    },
    output(extension: string): string {
      return this.add(files.temporaryUri(extension));
    },
    /** Marks the native job as started and returns its `onSettled`. */
    job(): () => void {
      running = true;
      return () => {
        running = false;
        settle();
      };
    },
    finish(): void {
      finished = true;
      settle();
    },
  };
}

/**
 * Resolves images to PNG/JPEG files a job can embed. Large photos and other still formats are
 * re-encoded once per call, so callers can pass any number of conversation or generated images
 * without asking the model to shrink or regenerate them.
 */
export async function prepareOfficeImages(
  ids: readonly string[],
  files: OfficeFiles,
  operation: Pick<OfficeOperation, 'add'>,
  signal: AbortSignal,
): Promise<Record<string, OfficeImage>> {
  const images: Record<string, OfficeImage> = {};
  if (!ids.length) return images;
  if (ids.length > OFFICE_MAX_IMAGES)
    throw new OfficeGenerationError(
      `This call uses ${ids.length} distinct images; one call accepts at most ${OFFICE_MAX_IMAGES}. Split the images across several calls.`,
    );
  const facts = await files.resolveAvailable(ids.map((id) => FileEntryIdSchema.parse(id)));
  signal.throwIfAborted();
  let total = 0;
  for (const id of ids) {
    const fact = facts.get(id);
    const uri = fact && files.localUri(fact);
    if (!fact || !uri || !fact.mediaType.startsWith('image/'))
      throw new OfficeGenerationError(`File ${id} is unavailable or is not an image.`);
    const prepared = await files.prepareImage(fact);
    signal.throwIfAborted();
    if (prepared) operation.add(prepared.uri);
    const mediaType = prepared?.mediaType ?? fact.mediaType;
    const size = files.size(prepared?.uri ?? uri);
    if ((mediaType !== 'image/png' && mediaType !== 'image/jpeg') || !size)
      throw new OfficeGenerationError(
        `Image "${fact.name}" could not be converted to PNG or JPEG.`,
      );
    total += size;
    images[id] = { uri: prepared?.uri ?? uri, size, mediaType };
  }
  if (total > OFFICE_MAX_FILE_BYTES)
    throw new OfficeGenerationError(
      `The images total ${mebibytes(total)} after compression, over the ${mebibytes(OFFICE_MAX_FILE_BYTES)} a call can embed. Split them across several calls.`,
    );
  return images;
}

/** A failed call: the model reads the message, and the conversation shows the call as failed. */
/** The model's filename with the format's extension, or null when it names another format. */
export function normalizeOfficeFilename(name: string, format: string): string | null {
  const extension = filenameExtension(name);
  const filename = extension ? name : `${name}.${format}`;
  return (extension && extension !== format) || !SafeNameSchema.safeParse(filename).success
    ? null
    : filename;
}

export function officeFailure(message: string): RuntimeToolResult {
  return {
    value: { status: 'error', message },
    artifacts: [],
    failure: {
      scope: 'call',
      error: { code: 'office_failed', message, retryable: false, origin: 'tool' },
    },
  };
}
