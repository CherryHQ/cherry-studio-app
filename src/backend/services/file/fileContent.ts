import { File } from 'expo-file-system';
import * as z from 'zod';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { fileLibraryService } from '@/backend/data/services/FileLibraryService';
import {
  DocumentExtractionError,
  extractDocumentInputSchema,
  type ExtractDocumentInput,
  type DocumentExtractionResult,
} from '@/shared/contracts/documentExtraction';
import type {
  PrepareFileAttachmentsInput,
  PreparedFile,
  ResolvedFile,
} from '@/shared/contracts/file';
import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import {
  type FileEntry,
  type FileEntryId,
  FileEntryIdSchema,
  type FileEntryProvenance,
  FileEntryProvenanceSchema,
  MediaTypeSchema,
  SafeNameSchema,
  TimestampSchema,
} from '@/shared/data/types/file';
import type { FilePlacement } from '@/shared/data/types/fileLibrary';

import { readDocumentUriText } from './documentText';
import { editFileImage } from './editFileImage';
import { extractDocument } from './extractDocument';
import { FileHashError, hashLocalFile } from './fileHash';
import {
  createInternalEntryWithPreview,
  generateFilePreviewUri,
  getTrashedImagePreviewUri,
  resolveCachedFilePreviewUris,
} from './filePreviewStorage';
import {
  createInternalEntry,
  deleteInternalEntry,
  discardInternalEntries,
  getFileUri,
  readFileUriBytes,
  resolveFileEntry,
  rewriteInternalTextEntry,
} from './fileStorage';
import { observeFileOcr } from './fileTextExtraction';
import { readImageUriText } from './imageText';
import { importManagedFile } from './importManagedFile';
import { prepareFileAttachments } from './prepareFileAttachments';

const createInternalEntryInputSchema = z.strictObject({
  workspaceSessionId: z.string().min(1).optional(),
  folderId: z.uuid().nullable().optional(),
  mediaType: MediaTypeSchema.optional(),
  name: SafeNameSchema.optional(),
  uri: z.string().min(1),
});

const createTextEntryInputSchema = z.strictObject({
  folderId: z.uuid().nullable().optional(),
  baseFileEntryId: z.uuid().optional(),
  conflictIfExists: z.boolean().optional(),
  workspaceFolderId: z.uuid().nullable().optional(),
  baseUpdatedAt: z.int().nonnegative().optional(),
  expectedName: SafeNameSchema.optional(),
  data: z.string(),
  mediaType: MediaTypeSchema,
  name: SafeNameSchema,
  provenance: FileEntryProvenanceSchema,
});

const createFileEntryInputSchema = createTextEntryInputSchema.omit({ data: true }).extend({
  uri: z.string().min(1),
});

async function resolveCreatedEntry(entry: FileEntry): Promise<ResolvedFile> {
  const resolved = await resolveFileEntry(fileEntryService, entry.id);
  if (!resolved) {
    await discardInternalEntries(fileEntryService, [entry]);
    throw new Error(`Created internal file cannot be resolved: ${entry.id}`);
  }
  return resolved;
}

/**
 * Managed-file port over `fileStorage`, validated at the boundary.
 *
 * A module singleton rather than a constructed adapter: the entry service it
 * closes over is a module singleton itself, so there is nothing left for a
 * factory to inject.
 */
export const fileContent = {
  observeFileOcr,
  async extractDocument(
    input: ExtractDocumentInput,
    signal = new AbortController().signal,
  ): Promise<DocumentExtractionResult> {
    const parsed = extractDocumentInputSchema.safeParse(input);
    if (!parsed.success) throw new DocumentExtractionError('invalid-input');
    const source = await resolveFileEntry(fileEntryService, parsed.data.fileEntryId);
    if (!source) throw new DocumentExtractionError('unavailable');
    try {
      return await extractDocument(source, parsed.data.options, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DocumentExtractionError) throw error;
      throw new DocumentExtractionError('failed');
    }
  },
  editImage: editFileImage,
  async prepareWorkspaceAttachment(
    input: {
      fileEntryId: FileEntryId;
    } & ({ sessionId: string; folderId?: never } | { folderId: string; sessionId?: never }),
  ): Promise<ResolvedFile> {
    const id = FileEntryIdSchema.parse(input.fileEntryId);
    const source = await resolveFileEntry(fileEntryService, id);
    if (!source) throw new Error('The attached file is unavailable.');
    const folder =
      input.sessionId !== undefined
        ? await fileLibraryService.workspace(input.sessionId)
        : await fileLibraryService.resolveDirectory(z.uuid().parse(input.folderId), '.');
    if (!folder || (await fileLibraryService.contains(folder.id, id))) return source;
    const logical = await fileLibraryService.fileForEntry(id);
    // A copy keeps its origin and bytes; only an import normalizes.
    const entry = await createInternalEntryWithPreview(fileEntryService, {
      uri: source.uri,
      name: logical?.name ?? source.entry.filename,
      mediaType: source.entry.mediaType,
      folderId: folder.id,
      provenance: source.entry.provenance,
      source: 'uri',
    });
    return resolveCreatedEntry(entry);
  },
  async hashFile(id: FileEntryId, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    const source = await resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id));
    if (!source) throw new FileHashError('RESOURCE_UNAVAILABLE');
    return hashLocalFile(source.uri, signal);
  },
  /**
   * Copies a transient picker, camera, or share URI into managed storage. This
   * port is import-only by contract, which is why it fixes the provenance
   * instead of taking it: anything that can produce other origins — an agent
   * tool, a peer transfer — uses `fileStorage.createInternalEntry` directly and
   * must state one.
   */
  createInternalEntry: async (input: {
    mediaType?: string;
    name?: string;
    uri: string;
    folderId?: string | null;
    workspaceSessionId?: string;
  }) => {
    const { workspaceSessionId, ...parsed } = createInternalEntryInputSchema.parse(input);
    const validated = workspaceSessionId
      ? {
          ...parsed,
          folderId: (await fileLibraryService.workspace(workspaceSessionId))?.id ?? null,
        }
      : parsed;
    const entry = await importManagedFile(fileEntryService, validated);
    return resolveCreatedEntry(entry);
  },
  /**
   * Store UTF-8 text as a new managed entry. Unlike an imported attachment it
   * has no preview to derive, so it skips the preview decorator, and the caller
   * keeps the entry rather than a resolved URI (agent tools return ids).
   *
   * Text entries are not inherently generated — a composer that saves pasted
   * text would land here too — so the caller states the origin.
   */
  createTextEntry: async (
    input: FilePlacement & {
      data: string;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal?: AbortSignal,
  ) => {
    const validated = createTextEntryInputSchema.parse(input);
    return createInternalEntry(fileEntryService, { ...validated, source: 'text' }, signal);
  },
  /**
   * Copies a finished local file, such as a generated document, into a new managed entry through
   * the same write/commit/rollback boundary as text files. The caller owns the source file.
   */
  createFileEntry: async (
    input: FilePlacement & {
      uri: string;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal?: AbortSignal,
  ) => {
    const validated = createFileEntryInputSchema.parse(input);
    return createInternalEntry(fileEntryService, { ...validated, source: 'uri' }, signal);
  },
  prepareAttachments: async (input: PrepareFileAttachmentsInput): Promise<PreparedFile[]> => {
    const signal = input.signal ?? new AbortController().signal;
    const resolved = new Map<string, ResolvedFile>();
    const facts = new Map<string, FileAttachmentFact>();
    for (const id of input.fileEntryIds) {
      signal.throwIfAborted();
      if (resolved.has(id)) continue;
      const parsed = FileEntryIdSchema.safeParse(id);
      if (!parsed.success) throw new FileAttachmentError({ code: 'unavailable' });
      const unavailable = new FileAttachmentError({
        code: 'unavailable',
        fileEntryId: parsed.data,
      });
      try {
        const file = await resolveFileEntry(fileEntryService, parsed.data);
        if (!file) throw unavailable;
        facts.set(id, {
          fileEntryId: file.entry.id,
          mediaType: file.entry.mediaType,
          name: file.entry.filename,
          size: new File(file.uri).size,
        });
        resolved.set(id, file);
      } catch {
        signal.throwIfAborted();
        // Native errors may contain private paths; expose only the managed reference.
        throw unavailable;
      }
    }
    const prepared = await prepareFileAttachments({
      availableFiles: facts,
      currentFileEntryIds: input.fileEntryIds,
      readBytes: (file, readSignal) =>
        readFileUriBytes(resolved.get(file.fileEntryId)!.uri, readSignal),
      readDocumentText: (file, readSignal) =>
        readDocumentUriText(resolved.get(file.fileEntryId)!.uri, file.mediaType, readSignal),
      readImageText: (file, readSignal) =>
        readImageUriText(resolved.get(file.fileEntryId)!.uri, readSignal),
      signal,
      target: input.target,
      documentParserMode: input.documentParserMode,
    });
    return input.fileEntryIds.map((id) => {
      const attachment = prepared.get(id)!;
      return {
        ...resolved.get(id)!,
        report: attachment.report,
        ...(attachment.content ? { content: attachment.content } : {}),
      };
    });
  },
  /** Imported originals cannot be rewritten; mutable Agent artifacts need a private snapshot. */
  prepareUploadSource: async (id: FileEntryId): Promise<ResolvedFile> => {
    const source = await resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id));
    if (!source) throw new Error('Upload source is unavailable');
    if (source.entry.provenance === 'imported') return source;
    const entry = await createInternalEntry(fileEntryService, {
      source: 'uri',
      uri: source.uri,
      name: source.entry.filename,
      mediaType: source.entry.mediaType,
      provenance: 'imported',
    });
    const snapshot = await resolveFileEntry(fileEntryService, entry.id);
    if (!snapshot) throw new Error('Upload snapshot is unavailable');
    return snapshot;
  },
  delete: (id: FileEntryId) => deleteInternalEntry(fileEntryService, FileEntryIdSchema.parse(id)),
  /**
   * Replace a draft text entry's bytes in place. Only a turn's own artifact is
   * a draft; the caller (the edit tool) proves that through its turn ledger.
   */
  rewriteTextEntry: (
    input: {
      data: string;
      id: FileEntryId;
      workspaceFolderId?: string | null;
      baseUpdatedAt?: number;
    },
    signal?: AbortSignal,
  ) =>
    rewriteInternalTextEntry(
      fileEntryService,
      { ...input, id: FileEntryIdSchema.parse(input.id) },
      signal,
    ),
  generatePreviewUri: async (entry: FileEntry) =>
    (await fileEntryService.findById(entry.id)) ? generateFilePreviewUri(entry) : undefined,
  getTrashThumbnailUri: (id: FileEntryId, deletedAt: number) =>
    getTrashedImagePreviewUri(
      fileEntryService,
      FileEntryIdSchema.parse(id),
      TimestampSchema.parse(deletedAt),
    ),
  getUri: (id: FileEntryId) => getFileUri(fileEntryService, FileEntryIdSchema.parse(id)),
  resolveUris: async (entries: readonly FileEntry[]) => {
    const available = new Set(
      (await fileEntryService.findAvailableByIds(entries.map((entry) => entry.id))).map(
        (entry) => entry.id,
      ),
    );
    return entries.map((entry) =>
      available.has(entry.id)
        ? resolveCachedFilePreviewUris(entry)
        : { previewUri: undefined, uri: undefined },
    );
  },
  resolve: (id: FileEntryId) => resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id)),
};
