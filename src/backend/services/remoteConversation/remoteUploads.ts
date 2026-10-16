import {
  uploadTransferLimits,
  uploadLimits,
  uploadMetadataSchema,
  type UploadChunk,
  type UploadAck,
  type UploadMetadata,
  type UploadState,
  type UploadReference,
  type UploadResume,
  type UploadComplete,
} from '@cherrystudio/remote-protocol';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as z from 'zod';

import type { fileContent } from '@/backend/services/file/fileContent';
import type { RemoteAttachment } from '@/shared/contracts/remoteAgent';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteConversationError } from './RemoteConversationError';

const logger = loggerService.withContext('RemoteUploads');

export type RemoteUploadFiles = Pick<
  typeof fileContent,
  'resolve' | 'prepareUploadSource' | 'hashFile'
>;
export const uploadProgressSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  sourceFileEntryId: FileEntryIdSchema,
  metadata: uploadMetadataSchema,
  expectedSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  resume: z.object({ resumeId: z.string(), expectedWriterEpoch: z.string() }).optional(),
});
export type UploadTransport = {
  checksumAlgorithm?: 'sha256';
  write(
    input: Omit<UploadChunk, 'kind' | 'requestId'>,
    signal: AbortSignal,
  ): Promise<Extract<UploadAck, { ok: true }>>;
};
export type GetUploadTransport = (signal: AbortSignal) => Promise<UploadTransport>;
export type SavedUpload = z.infer<typeof uploadProgressSchema>;
export type RemoteUploadRequests = {
  get(ref: UploadReference, signal: AbortSignal): Promise<UploadState>;
  prepare(metadata: UploadMetadata, signal: AbortSignal): Promise<UploadState>;
  resume(input: UploadResume, signal: AbortSignal): Promise<UploadState>;
  complete(input: UploadComplete, signal: AbortSignal): Promise<UploadState>;
  cancel(ref: UploadReference, signal: AbortSignal): Promise<unknown>;
};

/** Only stable local references and transfer identities enter the command journal. */
export async function uploadAttachments(
  attachments: RemoteAttachment[],
  files: RemoteUploadFiles,
  uploads: RemoteUploadRequests,
  signal: AbortSignal,
  progress: (sent: number, total: number, phase?: 'verifying') => void,
  saved: SavedUpload[],
  save: (value: SavedUpload[]) => void,
  getTransport: GetUploadTransport,
  uploadId?: string,
): Promise<UploadReference[]> {
  const startedAt = Date.now();
  let acknowledgedBytes = 0;
  if (attachments.length > uploadLimits.files)
    throw new RemoteConversationError('ATTACHMENT_LIMIT');
  const transport = await getTransport(signal);
  const prepared: { attachment: RemoteAttachment; file: File; sourceFileEntryId: string }[] = [];
  let total = 0;
  for (const attachment of attachments) {
    signal.throwIfAborted();
    const previous = saved.find((value) => value.fileEntryId === attachment.fileEntryId);
    const resolved = previous
      ? await files.resolve(previous.sourceFileEntryId)
      : await files.prepareUploadSource(attachment.fileEntryId);
    if (!resolved) throw new RemoteConversationError('RESOURCE_UNAVAILABLE');
    if (previous && !previous.expectedSha256 && resolved.entry.provenance !== 'imported')
      throw new RemoteConversationError('UPLOAD_SOURCE_CHANGED');
    const file = new File(resolved.uri);
    if (!file.exists) throw new RemoteConversationError('RESOURCE_UNAVAILABLE');
    if (file.size > uploadLimits.fileBytes) throw new RemoteConversationError('ATTACHMENT_LIMIT');
    total += file.size;
    prepared.push({ attachment, file, sourceFileEntryId: resolved.entry.id });
  }
  if (total > uploadLimits.messageBytes) throw new RemoteConversationError('ATTACHMENT_LIMIT');
  let records = saved;
  const remember = (entry: SavedUpload) => {
    signal.throwIfAborted();
    records = [...records.filter((value) => value.fileEntryId !== entry.fileEntryId), entry];
    save(records);
  };
  progress(0, total);
  const refs: UploadReference[] = [];
  let sent = 0;
  for (const { attachment, file, sourceFileEntryId } of prepared) {
    signal.throwIfAborted();
    const handle = file.open();
    const size = file.size;
    try {
      let initialEntry = records.find((value) => value.fileEntryId === attachment.fileEntryId);
      if (initialEntry && initialEntry.metadata.byteLength !== size)
        throw new RemoteConversationError('UPLOAD_SOURCE_CHANGED');
      if (!initialEntry) {
        const metadata = uploadMetadataSchema.safeParse({
          uploadId: uploadId ?? randomUUID(),
          filename: attachment.name,
          mediaType: attachment.mediaType,
          byteLength: size,
          ...(transport.checksumAlgorithm
            ? { checksumAlgorithm: transport.checksumAlgorithm }
            : {}),
        });
        if (!metadata.success) throw new RemoteConversationError('INVALID_ATTACHMENT');
        initialEntry = {
          fileEntryId: attachment.fileEntryId,
          sourceFileEntryId,
          metadata: metadata.data,
        };
        remember(initialEntry);
      }
      let entry: SavedUpload = initialEntry;
      if (entry.metadata.checksumAlgorithm !== transport.checksumAlgorithm)
        throw new RemoteConversationError('UPGRADE_REQUIRED');
      const recovering = saved.some((value) => value.fileEntryId === attachment.fileEntryId);
      const transfer = async (signal: AbortSignal): Promise<UploadState> => {
        let state: UploadState;
        try {
          state = await uploads.get({ uploadId: entry.metadata.uploadId }, signal);
        } catch (error) {
          if (!(error instanceof RemoteConversationError) || error.code !== 'NOT_FOUND')
            throw error;
          // This helper runs only before the immutable send parameters are recorded.
          entry = {
            ...entry,
            metadata: { ...entry.metadata, uploadId: uploadId ?? randomUUID() },
            resume: undefined,
          };
          remember(entry);
          state = await uploads.prepare(
            {
              ...entry.metadata,
            },
            signal,
          );
        }
        logger.info('Upload source prepared', {
          uploadId: entry.metadata.uploadId,
          byteLength: size,
          preparationMs: Date.now() - startedAt,
        });
        const ref = { uploadId: entry.metadata.uploadId };
        if (
          state.uploadId !== ref.uploadId ||
          state.checksumAlgorithm !== entry.metadata.checksumAlgorithm
        )
          throw new RemoteConversationError('PROTOCOL_ERROR');
        if (state.state === 'receiving') {
          const resume = entry.resume ?? {
            resumeId: randomUUID(),
            expectedWriterEpoch: state.writerEpoch,
          };
          entry = { ...entry, resume };
          remember(entry);
          state = await uploads.resume({ ...ref, ...resume }, signal);
          entry = { ...entry, resume: undefined };
          remember(entry);
          let offset = Number(state.committedOffset);
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > size)
            throw new RemoteConversationError('PROTOCOL_ERROR');
          handle.offset = offset;
          progress(sent + offset, total);
          while (offset < size) {
            signal.throwIfAborted();
            const startedAt = Date.now();
            const writes = [];
            try {
              for (let i = 0; i < uploadTransferLimits.window && offset < size; i++) {
                const bytes = handle.readBytes(
                  Math.min(uploadTransferLimits.chunkBytes, size - offset),
                );
                if (!bytes.length) throw new RemoteConversationError('RESOURCE_UNAVAILABLE');
                const expected = offset + bytes.length;
                writes.push(
                  transport
                    .write(
                      { ...ref, writerEpoch: state.writerEpoch, offset: String(offset), bytes },
                      signal,
                    )
                    .then((reply) => {
                      if (
                        reply.uploadId !== ref.uploadId ||
                        reply.writerEpoch !== state.writerEpoch ||
                        Number(reply.committedOffset) < expected
                      )
                        throw new RemoteConversationError('PROTOCOL_ERROR');
                      acknowledgedBytes += bytes.length;
                      return expected;
                    }),
                );
                offset = expected;
              }
            } catch (error) {
              await Promise.allSettled(writes);
              throw error;
            }
            const results = await Promise.allSettled(writes);
            const failed = results.find((result) => result.status === 'rejected');
            if (failed?.status === 'rejected') throw failed.reason;
            progress(sent + offset, total);
            await new Promise<void>((resolve) =>
              setTimeout(resolve, Math.max(0, 32 - (Date.now() - startedAt))),
            );
          }
        }
        signal.throwIfAborted();
        progress(
          sent + Number(state.state === 'receiving' ? size : state.committedOffset),
          total,
          'verifying',
        );
        return state;
      };
      let state: UploadState;
      let expectedSha256: string | undefined;
      if (entry.metadata.checksumAlgorithm === 'sha256') {
        const abort = new AbortController();
        const taskSignal = AbortSignal.any([signal, abort.signal]);
        const hashing = files.hashFile(entry.sourceFileEntryId, taskSignal).then((digest) => {
          taskSignal.throwIfAborted();
          if (!/^[a-f0-9]{64}$/.test(digest))
            throw new RemoteConversationError('VERIFICATION_FAILED');
          if (entry.expectedSha256 && entry.expectedSha256 !== digest)
            throw new RemoteConversationError('UPLOAD_SOURCE_CHANGED');
          entry = { ...entry, expectedSha256: digest };
          remember(entry);
          logger.info('Upload source hashed', {
            uploadId: entry.metadata.uploadId,
            elapsedMs: Date.now() - startedAt,
          });
          return digest;
        });
        const sending = recovering
          ? hashing.then(() => transfer(taskSignal))
          : transfer(taskSignal);
        try {
          [expectedSha256, state] = await Promise.all([hashing, sending]);
        } catch (error) {
          abort.abort();
          await Promise.allSettled([hashing, sending]);
          signal.throwIfAborted();
          if (error instanceof RemoteConversationError) throw error;
          const code =
            error && typeof error === 'object' && 'code' in error ? error.code : undefined;
          throw new RemoteConversationError(
            code === 'NATIVE_HASH_UNAVAILABLE' || code === 'RESOURCE_UNAVAILABLE'
              ? code
              : 'VERIFICATION_FAILED',
          );
        }
      } else {
        state = await transfer(signal);
      }
      signal.throwIfAborted();
      const ref = { uploadId: entry.metadata.uploadId };
      progress(sent + size, total, 'verifying');
      if (state.state === 'receiving')
        state = await uploads.complete(
          {
            ...ref,
            writerEpoch: state.writerEpoch,
            ...(expectedSha256 ? { expectedSha256 } : {}),
          },
          signal,
        );
      while (state.state === 'verifying') {
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        signal.throwIfAborted();
        state = await uploads.get(ref, signal);
      }
      if (state.state === 'failed')
        throw new RemoteConversationError(state.failureCode ?? 'VERIFICATION_FAILED');
      if (
        state.uploadId !== ref.uploadId ||
        state.state !== 'ready' ||
        Number(state.committedOffset) !== size ||
        state.checksumAlgorithm !== entry.metadata.checksumAlgorithm ||
        (entry.metadata.checksumAlgorithm === 'sha256' && state.sha256 !== expectedSha256)
      )
        throw new RemoteConversationError('INVALID_ATTACHMENT');
      refs.push(ref);
      sent += size;
      progress(sent, total);
    } finally {
      handle.close();
    }
  }
  signal.throwIfAborted();
  logger.info('Upload completed', {
    byteLength: total,
    acknowledgedBytes,
    elapsedMs: Date.now() - startedAt,
  });
  return refs;
}
