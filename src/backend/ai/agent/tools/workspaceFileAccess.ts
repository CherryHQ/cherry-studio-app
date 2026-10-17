import {
  fileLibraryService,
  type FileLibraryService,
} from '@/backend/data/services/FileLibraryService';
import { fileContent } from '@/backend/services/file/fileContent';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import { FileEntryIdSchema, type FileEntry, type FileEntryId } from '@/shared/data/types/file';

import type { TurnToolResources } from '../resources/managedFileResolver';

export type FileToolReference = {
  file_entry_id?: string;
  path?: string;
  base_file_entry_id?: string;
  base_revision?: number;
};
type TextInput = { data: string; name: string; mediaType: string; baseUpdatedAt?: number };

/** One turn captures a folder reference; every operation rechecks its live availability. */
export class WorkspaceFileAccess {
  private readonly approvedLibraryReads = new Set<string>();

  constructor(
    readonly folderId: string | null,
    private readonly resources: TurnToolResources,
    readonly library: FileLibraryService = fileLibraryService,
    private readonly content: Pick<
      typeof fileContent,
      'createTextEntry' | 'rewriteTextEntry'
    > = fileContent,
  ) {}

  async resolveRead(input: FileToolReference): Promise<FileEntryId> {
    const id = await this.resolveReference(input);
    if (
      !this.resources.fileEntryIds.has(id) &&
      !(this.folderId && (await this.library.contains(this.folderId, id)))
    ) {
      throw DataApiErrorFactory.invalidOperation(
        'read_file',
        'Use library_read_file and ask the user before reading a file outside the workspace.',
      );
    }
    return id;
  }

  async resolveEdit(input: FileToolReference): Promise<FileEntryId> {
    const id = await this.resolveReference(input);
    if (
      !this.resources.fileEntryIds.has(id) &&
      !this.approvedLibraryReads.has(id) &&
      !(this.folderId && (await this.library.contains(this.folderId, id)))
    ) {
      throw DataApiErrorFactory.invalidOperation(
        'edit_file',
        'Read this file with library_read_file and user approval first.',
      );
    }
    if (input.path && (input.base_file_entry_id !== id || input.base_revision === undefined))
      throw DataApiErrorFactory.conflict(
        'Provide base_file_entry_id and base_revision from the last read of this path; read again if its version changed.',
      );
    return id;
  }

  approveLibraryRead(id: FileEntryId): void {
    this.approvedLibraryReads.add(id);
  }

  isDraft(id: FileEntryId): boolean {
    return this.resources.draftFileEntryIds.has(id);
  }

  async write(
    input: TextInput & { path?: string; baseFileEntryId?: string },
    signal: AbortSignal,
  ): Promise<FileEntry> {
    if (!this.folderId) {
      if (input.path?.includes('/') || input.baseFileEntryId)
        throw DataApiErrorFactory.invalidOperation(
          'write_file',
          'Select a workspace to write by path. Use edit_file to revise a referenced file.',
        );
      return this.content.createTextEntry(
        { data: input.data, name: input.name, mediaType: input.mediaType, provenance: 'generated' },
        signal,
      );
    }
    const target = await this.library.resolvePath(this.folderId, input.path ?? input.name);
    if (target.file) {
      if (input.baseFileEntryId !== target.file.currentEntryId || input.baseUpdatedAt === undefined)
        throw DataApiErrorFactory.conflict(
          'This path already exists. Read it and supply its current base_file_entry_id and base_revision.',
        );
      if (this.resources.draftFileEntryIds.has(target.file.currentEntryId))
        return this.rewrite(
          { data: input.data, id: target.file.currentEntryId, baseUpdatedAt: input.baseUpdatedAt },
          signal,
        );
    } else if (input.baseFileEntryId) {
      throw DataApiErrorFactory.conflict('The path no longer names the version you read.');
    }
    return this.content.createTextEntry(
      {
        data: input.data,
        mediaType: input.mediaType,
        name: target.file?.name ?? target.name,
        provenance: 'generated',
        folderId: target.folderId,
        baseFileEntryId: target.file?.currentEntryId,
        baseUpdatedAt: input.baseUpdatedAt,
        workspaceFolderId: this.folderId,
        expectedName: target.name,
        conflictIfExists: true,
      },
      signal,
    );
  }

  async createVersion(
    sourceId: FileEntryId,
    input: TextInput,
    signal: AbortSignal,
  ): Promise<FileEntry> {
    const file = await this.library.fileForEntry(sourceId);
    if (!file) throw DataApiErrorFactory.notFound('FileEntry', sourceId);
    const inDestination = this.folderId
      ? await this.library.contains(this.folderId, sourceId)
      : file.folderId === null;
    return this.content.createTextEntry(
      {
        ...input,
        name: file.name,
        provenance: 'generated',
        folderId: inDestination ? file.folderId : this.folderId,
        workspaceFolderId: this.folderId,
        ...(inDestination ? { baseFileEntryId: sourceId } : {}),
      },
      signal,
    );
  }

  async rewrite(
    input: { data: string; id: FileEntryId; baseUpdatedAt?: number },
    signal: AbortSignal,
  ): Promise<FileEntry> {
    const file = await this.library.fileForEntry(input.id);
    const inDestination =
      file &&
      (this.folderId
        ? await this.library.contains(this.folderId, input.id)
        : file.folderId === null);
    if (!inDestination)
      throw DataApiErrorFactory.conflict(
        'This draft moved outside the workspace. Read it again and create a new file.',
      );
    return this.content.rewriteTextEntry({ ...input, workspaceFolderId: this.folderId }, signal);
  }

  private async resolveReference(input: FileToolReference): Promise<FileEntryId> {
    if (Boolean(input.file_entry_id) === Boolean(input.path))
      throw DataApiErrorFactory.invalidOperation(
        'file reference',
        'Provide exactly one of file_entry_id or path.',
      );
    if (input.file_entry_id) return FileEntryIdSchema.parse(input.file_entry_id);
    if (!this.folderId)
      throw DataApiErrorFactory.invalidOperation('file path', 'No workspace is selected.');
    const result = await this.library.resolvePath(this.folderId, input.path!);
    if (!result.file) throw DataApiErrorFactory.notFound('File', input.path);
    return FileEntryIdSchema.parse(result.file.currentEntryId);
  }
}
