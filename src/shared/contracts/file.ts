import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import type {
  DocumentParserMode,
  FileAttachmentContent,
  FileAttachmentReport,
  FileAttachmentTarget,
} from './fileAttachment';
import type { EditFileImageInput } from './fileImageEdit';

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export type ResolvedFileUris = {
  /** Small image thumbnail when available; the original URI for other file kinds. */
  previewUri: string | undefined;
  /** Original managed file URI used when opening the file. */
  uri: string | undefined;
};

export type CreateInternalEntryInput = {
  workspaceSessionId?: string;
  folderId?: string | null;
  /** Authoritative media type from the picker; extension inference is the fallback. */
  mediaType?: string;
  name?: string;
  uri: string;
};

export type PrepareFileAttachmentsInput = {
  fileEntryIds: readonly FileEntryId[];
  target: FileAttachmentTarget;
  documentParserMode?: DocumentParserMode;
  signal?: AbortSignal;
};

export type PreparedFile = ResolvedFile & {
  report: FileAttachmentReport;
  content?: FileAttachmentContent;
};

/** Native extraction waiting for capacity, or confirmed on-device text recognition. */
export type FileOcrState =
  | { status: 'queued' }
  | { status: 'recognizing'; kind: 'pdf' | 'image'; completedPages: number; totalPages: number };

export interface FileModule {
  /**
   * Recognition of one file, keyed by its entry ID or by the running read_file call reading it.
   * Calls back immediately, then on change. Undefined when idle.
   */
  observeFileOcr(key: string, observer: (state: FileOcrState | undefined) => void): () => void;
  /** Copies the transient source URI into managed storage and creates the entry. */
  createInternalEntry(input: CreateInternalEntryInput): Promise<ResolvedFile>;
  /** Reuse a workspace file or copy an explicitly attached outside version into it. */
  prepareWorkspaceAttachment(
    input: {
      fileEntryId: FileEntryId;
    } & ({ sessionId: string; folderId?: never } | { folderId: string; sessionId?: never }),
  ): Promise<ResolvedFile>;
  /** Crops/rotates a still image into a new managed entry, preserving the source. */
  editImage(input: EditFileImageInput, signal?: AbortSignal): Promise<ResolvedFile>;
  /** Validates managed references and parses supported content only when the caller submits. */
  prepareAttachments(input: PrepareFileAttachmentsInput): Promise<PreparedFile[]>;
  /** User deletion keeps bytes in the trash for 30 days. */
  moveToTrash(id: FileEntryId): Promise<boolean>;
  /** Hard-delete: removes the entry row and its bytes. */
  delete(id: FileEntryId): Promise<boolean>;
  /** Generates or reads an image preview only while its entry is active. */
  generatePreviewUri(entry: FileEntry): Promise<string | undefined>;
  /** Thumbnail-only access to the same recoverable deletion shown in the trash. */
  getTrashThumbnailUri(id: FileEntryId, deletedAt: number): Promise<string | undefined>;
  /** Mobile URI equivalent of Cherry Desktop's getUrl. */
  getUri(id: FileEntryId): Promise<string | undefined>;
  /** Resolves a database page without re-reading entries one by one. */
  resolveUris(entries: readonly FileEntry[]): Promise<ResolvedFileUris[]>;
}
