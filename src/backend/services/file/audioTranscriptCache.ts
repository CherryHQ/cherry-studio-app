import { Directory, File, Paths } from 'expo-file-system';

import type { FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import type { FileEntry } from '@/shared/data/types/file';

type TranscriptSource = Pick<FileAttachmentFact, 'fileEntryId' | 'revision' | 'size'>;

function entryDirectory(id: string): Directory {
  return new Directory(Paths.cache, 'AudioTranscripts', id);
}

function transcriptFile(source: TranscriptSource): File {
  return new File(entryDirectory(source.fileEntryId), `${source.revision ?? 0}_${source.size}.txt`);
}

/**
 * Derived transcripts of managed audio, removed with their entry. A transcript describes the
 * recording rather than the model that produced it, so changing models reuses it.
 */
export const audioTranscriptCache = {
  async read(source: TranscriptSource): Promise<string | undefined> {
    const file = transcriptFile(source);
    return file.exists ? file.text() : undefined;
  },
  async write(source: TranscriptSource, text: string): Promise<void> {
    entryDirectory(source.fileEntryId).create({ idempotent: true, intermediates: true });
    transcriptFile(source).write(text);
  },
};

export function deleteAudioTranscripts(entry: Pick<FileEntry, 'id'>): void {
  const directory = entryDirectory(entry.id);
  if (directory.exists) directory.delete();
}
