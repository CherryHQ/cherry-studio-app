import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { TurnToolResources } from '../../resources/managedFileResolver';
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`;
const folderId = id(9);
const sourceId = id(1);
const signal = new AbortController().signal;
function setup(workspace: string | null = folderId) {
  const fileEntryIds = new Set<string>();
  const resources: TurnToolResources = {
    availableFiles: new Map(),
    fileEntryIds,
    draftFileEntryIds: new Set(),
    grantFile: jest.fn(),
  };
  const library = {
    contains: jest.fn(async () => false),
    fileForEntry: jest.fn(async () => ({
      id: sourceId,
      name: 'Notes.md',
      folderId: null,
      currentEntryId: sourceId,
    })),
    resolvePath: jest.fn(async () => ({
      folderId,
      name: 'Notes.md',
      file: { currentEntryId: sourceId, name: 'Notes.md' },
    })),
  };
  const entry = FileEntrySchema.parse({
    id: id(2),
    filename: 'Notes.md',
    mediaType: 'text/markdown',
    size: 3,
    provenance: 'generated',
    createdAt: 1,
    updatedAt: 1,
  });
  const content = {
    createTextEntry: jest.fn(async (_input: unknown, _signal?: AbortSignal) => entry),
    rewriteTextEntry: jest.fn(async (_input: unknown, _signal?: AbortSignal) => entry),
  };
  const access = new WorkspaceFileAccess(
    workspace,
    resources,
    library as unknown as FileLibraryService,
    content,
  );
  return { access, resources, fileEntryIds, library, content };
}

describe('turn workspace file access', () => {
  it('permits conversation references and workspace members, but rejects arbitrary ids', async () => {
    const { access, fileEntryIds, library } = setup();
    await expect(access.resolveRead({ file_entry_id: sourceId })).rejects.toThrow();
    await expect(access.resolveEdit({ file_entry_id: sourceId })).rejects.toThrow();
    fileEntryIds.add(sourceId);
    await expect(access.resolveRead({ file_entry_id: sourceId })).resolves.toBe(sourceId);
    fileEntryIds.clear();
    library.contains.mockResolvedValue(true);
    await expect(access.resolveRead({ path: 'Notes.md' })).resolves.toBe(sourceId);
  });

  it('an approved outside read authorizes a copy, without silently granting future reads', async () => {
    const { access, resources, content } = setup();
    access.approveLibraryRead(sourceId);
    await expect(access.resolveEdit({ file_entry_id: sourceId })).resolves.toBe(sourceId);
    await expect(access.resolveRead({ file_entry_id: sourceId })).rejects.toThrow();
    await access.createVersion(
      sourceId,
      { data: 'new', mediaType: 'text/markdown', name: 'Notes.md', baseUpdatedAt: 1 },
      signal,
    );
    expect(content.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ folderId, workspaceFolderId: folderId, name: 'Notes.md' }),
      signal,
    );
    expect(content.createTextEntry.mock.calls[0]?.[0]).not.toHaveProperty('baseFileEntryId');
    expect(resources.grantFile).not.toHaveBeenCalled();
  });

  it('requires the version and revision for an occupied path before writing', async () => {
    const { access, content } = setup();
    const input = { data: 'new', mediaType: 'text/markdown', name: 'Notes.md', path: 'Notes.md' };
    await expect(access.write(input, signal)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      access.write({ ...input, baseFileEntryId: id(3), baseUpdatedAt: 1 }, signal),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(content.createTextEntry).not.toHaveBeenCalled();
    await access.write({ ...input, baseFileEntryId: sourceId, baseUpdatedAt: 1 }, signal);
    expect(content.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        baseFileEntryId: sourceId,
        baseUpdatedAt: 1,
        conflictIfExists: true,
        workspaceFolderId: folderId,
      }),
      signal,
    );
  });

  it('keeps plain outputs at root without a workspace and refuses directory paths', async () => {
    const { access, content } = setup(null);
    const input = { data: 'new', mediaType: 'text/markdown', name: 'Notes.md' };
    await access.write(input, signal);
    expect(content.createTextEntry).toHaveBeenCalledWith(
      { ...input, provenance: 'generated' },
      signal,
    );
    await expect(access.write({ ...input, path: 'Reports/Notes.md' }, signal)).rejects.toThrow();
    await expect(access.resolveRead({ path: 'Notes.md' })).rejects.toThrow();
  });
});
