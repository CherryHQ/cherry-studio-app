import {
  agentUploadLimits,
  uploadMetadataSchema,
  type AgentUploadState,
  type AgentUploadReference,
} from '@cherrystudio/remote-protocol/agent';
import { sha256 } from '@noble/hashes/sha2.js';
import { fromByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as z from 'zod';

import type { fileContent } from '@/backend/services/file/fileContent';
import type { RemoteAttachment } from '@/shared/contracts/remoteAgent';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from './RemoteAgentError';
import { integrity, type AgentRequest } from './remoteContent';

export type RemoteUploadFiles = Pick<typeof fileContent, 'resolve'>;
export const uploadProgressSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  metadata: uploadMetadataSchema,
  resume: z.object({ resumeId: z.string(), expectedWriterEpoch: z.string() }).optional(),
});
export type SavedUpload = z.infer<typeof uploadProgressSchema>;

/** Only stable local references and transfer identities enter the command journal. */
export async function uploadAttachments(
  attachments: RemoteAttachment[],
  files: RemoteUploadFiles,
  request: AgentRequest,
  signal: AbortSignal,
  progress: (sent: number, total: number) => void,
  saved: SavedUpload[],
  save: (value: SavedUpload[]) => void,
): Promise<AgentUploadReference[]> {
  if (attachments.length > agentUploadLimits.files) throw new RemoteAgentError('ATTACHMENT_LIMIT');
  const prepared: { attachment: RemoteAttachment; file: File }[] = [];
  let total = 0;
  for (const attachment of attachments) {
    signal.throwIfAborted();
    const resolved = await files.resolve(attachment.fileEntryId);
    if (!resolved) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
    const file = new File(resolved.uri);
    if (!file.exists) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
    if (file.size > agentUploadLimits.fileBytes) throw new RemoteAgentError('ATTACHMENT_LIMIT');
    total += file.size;
    prepared.push({ attachment, file });
  }
  if (total > agentUploadLimits.messageBytes) throw new RemoteAgentError('ATTACHMENT_LIMIT');
  let records = saved;
  const remember = (entry: SavedUpload) => {
    records = [...records.filter((value) => value.fileEntryId !== entry.fileEntryId), entry];
    save(records);
  };
  progress(0, total);
  const refs: AgentUploadReference[] = [];
  let sent = 0;
  for (const { attachment, file } of prepared) {
    signal.throwIfAborted();
    const handle = file.open();
    const size = file.size;
    try {
      const hash = sha256.create();
      for (let offset = 0; offset < size;) {
        signal.throwIfAborted();
        const bytes = handle.readBytes(Math.min(agentUploadLimits.chunkBytes, size - offset));
        if (!bytes.length) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
        hash.update(bytes);
        offset += bytes.length;
        if (offset % (agentUploadLimits.chunkBytes * 16) === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const digest = Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      );
      let entry = records.find((value) => value.fileEntryId === attachment.fileEntryId);
      if (entry && (entry.metadata.sha256 !== digest || entry.metadata.byteLength !== size))
        throw new RemoteAgentError('INVALID_ATTACHMENT');
      if (!entry) {
        const metadata = uploadMetadataSchema.safeParse({
          uploadId: randomUUID(),
          filename: attachment.name,
          mediaType: attachment.mediaType,
          byteLength: size,
          sha256: digest,
        });
        if (!metadata.success) throw new RemoteAgentError('INVALID_ATTACHMENT');
        entry = { fileEntryId: attachment.fileEntryId, metadata: metadata.data };
        remember(entry);
      }
      let state: AgentUploadState;
      try {
        state = await request('agent.uploads.get', { uploadId: entry.metadata.uploadId }, signal);
      } catch (error) {
        if (!(error instanceof RemoteAgentError) || error.code !== 'NOT_FOUND') throw error;
        // This helper runs only before the immutable send parameters are recorded.
        entry = {
          ...entry,
          metadata: { ...entry.metadata, uploadId: randomUUID() },
          resume: undefined,
        };
        remember(entry);
        state = await request('agent.uploads.prepare', entry.metadata, signal);
      }
      const ref = { uploadId: entry.metadata.uploadId };
      if (state.uploadId !== ref.uploadId) throw new RemoteAgentError('PROTOCOL_ERROR');
      if (state.state === 'receiving') {
        const resume = entry.resume ?? {
          resumeId: randomUUID(),
          expectedWriterEpoch: state.writerEpoch,
        };
        remember({ ...entry, resume });
        state = await request('agent.uploads.resume', { ...ref, ...resume }, signal);
        remember({ ...entry, resume: undefined });
        let offset = Number(state.committedOffset);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > size)
          throw new RemoteAgentError('PROTOCOL_ERROR');
        handle.offset = offset;
        progress(sent + offset, total);
        while (offset < size) {
          signal.throwIfAborted();
          const startedAt = Date.now();
          const writes = [];
          for (let i = 0; i < agentUploadLimits.window && offset < size; i++) {
            const bytes = handle.readBytes(Math.min(agentUploadLimits.chunkBytes, size - offset));
            if (!bytes.length) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
            const expected = offset + bytes.length;
            writes.push(
              request(
                'agent.uploads.write',
                {
                  ...ref,
                  writerEpoch: state.writerEpoch,
                  offset: String(offset),
                  dataBase64: fromByteArray(bytes),
                  chunkSha256: integrity.sha256(bytes),
                },
                signal,
              ).then((reply) => {
                if (
                  reply.uploadId !== ref.uploadId ||
                  reply.writerEpoch !== state.writerEpoch ||
                  Number(reply.committedOffset) < expected
                )
                  throw new RemoteAgentError('PROTOCOL_ERROR');
                return expected;
              }),
            );
            offset = expected;
          }
          const results = await Promise.allSettled(writes);
          const failed = results.find((result) => result.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          progress(sent + offset, total);
          await new Promise<void>((resolve) =>
            setTimeout(resolve, Math.max(0, 32 - (Date.now() - startedAt))),
          );
        }
        state = await request(
          'agent.uploads.complete',
          { ...ref, writerEpoch: state.writerEpoch },
          signal,
        );
      }
      while (state.state === 'verifying') {
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        signal.throwIfAborted();
        state = await request('agent.uploads.get', ref, signal);
      }
      if (state.state !== 'ready' || Number(state.committedOffset) !== size)
        throw new RemoteAgentError('INVALID_ATTACHMENT');
      refs.push(ref);
      sent += size;
      progress(sent, total);
    } finally {
      handle.close();
    }
  }
  signal.throwIfAborted();
  return refs;
}
