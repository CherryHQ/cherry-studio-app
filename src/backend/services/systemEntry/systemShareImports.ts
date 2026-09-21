import { Directory, File, Paths } from 'expo-file-system';
import { v4 as uuid } from 'uuid';
import * as z from 'zod';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import {
  createInternalEntry,
  deleteInternalEntry,
  discardReservedInternalFile,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';
import type { AgentInputPart, AgentSessionView } from '@/shared/contracts/agent';

import type { NativeSystemEntry } from '../../../../modules/system-integration';

const receiptSchema = z.strictObject({
  id: z.uuid(),
  createdAt: z.number().finite().positive(),
  fileIds: z.array(z.uuid()).max(10),
});

/** Receipts store identities only. Publishing before copying closes the import/restart duplication gap. */
export function createSystemShareImports(dependencies: {
  entries: FileEntryService;
  findSession(id: string): Promise<AgentSessionView | null>;
}) {
  const directory = new Directory(Paths.document, 'SystemEntryReceipts');
  const receiptFile = (id: string) => new File(directory, `${z.uuid().parse(id)}.json`);
  const read = async (file: File) => receiptSchema.parse(JSON.parse(await file.text()));

  async function discard(id: string) {
    const file = receiptFile(id);
    if (!file.exists) return;
    const receipt = await read(file);
    // A committed chat is the authoritative send receipt, including after a process crash.
    if (!(await dependencies.findSession(id))) {
      for (const fileId of receipt.fileIds) {
        await deleteInternalEntry(dependencies.entries, fileId);
        discardReservedInternalFile(fileId);
      }
    }
    file.delete();
  }

  return {
    async import(entry: NativeSystemEntry, signal: AbortSignal): Promise<AgentInputPart[]> {
      signal.throwIfAborted();
      if (!directory.exists) directory.create({ intermediates: true });
      const file = receiptFile(entry.id);
      const attachments = entry.files;
      const receipt = file.exists
        ? await read(file)
        : {
            id: entry.id,
            createdAt: entry.createdAt,
            fileIds: attachments.map(() => uuid()),
          };
      if (receipt.id !== entry.id || receipt.fileIds.length !== attachments.length)
        throw new Error('Invalid share receipt');
      if (!file.exists) {
        const pending = new File(directory, `${entry.id}.pending`);
        pending.write(JSON.stringify(receipt));
        pending.move(file);
      }
      const parts: AgentInputPart[] = [];
      for (const [index, attachment] of attachments.entries()) {
        signal.throwIfAborted();
        const id = receipt.fileIds[index]!;
        let resolved = await resolveFileEntry(dependencies.entries, id);
        if (!resolved) {
          // A missing blob with a surviving row cannot be silently replaced.
          if (await dependencies.entries.findById(id))
            throw new Error('Shared file is unavailable');
          await createInternalEntry(
            dependencies.entries,
            {
              source: 'uri',
              uri: attachment.uri,
              name: attachment.name,
              mediaType: attachment.mediaType,
              provenance: 'imported',
            },
            signal,
            id,
          );
          resolved = await resolveFileEntry(dependencies.entries, id);
        }
        if (!resolved) throw new Error('Shared file is unavailable');
        parts.push({
          type: 'file',
          fileEntryId: resolved.entry.id,
          mediaType: resolved.entry.mediaType,
          name: resolved.entry.filename,
        });
      }
      return parts;
    },
    discard,
    forget(id: string) {
      const file = receiptFile(id);
      if (file.exists) file.delete();
    },
    async cleanExpired() {
      if (!directory.exists) return;
      for (const file of directory.list()) {
        if (!(file instanceof File)) continue;
        if (file.name.endsWith('.pending')) {
          file.delete();
          continue;
        }
        if (!file.name.endsWith('.json')) continue;
        const receipt = await read(file);
        if (
          Date.now() - receipt.createdAt > 86_400_000 ||
          (await dependencies.findSession(receipt.id))
        )
          await discard(receipt.id);
      }
    },
  };
}
