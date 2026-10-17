import { subscribeDataApiChanges } from '@/backend/data/dataApiChanges';
import { validateFileLibraryReferences } from '@/backend/data/db/fileLibraryValidation';
import { createServiceTestDatabase } from '@/backend/data/serviceTestDatabase';

import { FileEntryService } from '../FileEntryService';
import { FileLibraryService } from '../FileLibraryService';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`;

describe('file library folders, versions, and workspaces', () => {
  let database: ReturnType<typeof createServiceTestDatabase>;
  let library: FileLibraryService;
  let entries: FileEntryService;
  const create = (n: number, placement: Partial<Parameters<FileEntryService['create']>[0]> = {}) =>
    entries.create({
      id: id(n),
      filename: 'Notes.md',
      mediaType: 'text/markdown',
      size: 5,
      provenance: 'generated',
      ...placement,
    });

  beforeEach(() => {
    database = createServiceTestDatabase();
    library = new FileLibraryService(database.dbService);
    entries = new FileEntryService(database.dbService);
  });
  afterEach(() => database.sqlite.close());

  function validate() {
    validateFileLibraryReferences({
      folders: database.sqlite.prepare('SELECT * FROM file_folder').all() as never,
      files: database.sqlite.prepare('SELECT * FROM library_file').all() as never,
      versions: database.sqlite.prepare('SELECT * FROM file_entry').all() as never,
    });
    expect(database.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }

  it.each([1, 50])('publishes one committed batch for %i versions in a folder', async (count) => {
    const folder = await library.createFolder(null, 'Folder');
    for (let index = 1; index <= count; index += 1)
      await create(index, { folderId: folder.id, filename: `File-${index}.txt` });
    const changed = jest.fn();
    const unsubscribe = subscribeDataApiChanges(changed);
    try {
      await library.trashFolder(folder.id);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(
        changed.mock.calls[0]![0].filter((path: string) => path.startsWith('/files/entries/')),
      ).toHaveLength(count);
      expect(changed.mock.calls[0]![0]).not.toContain('/agent-sessions');
      changed.mockClear();
      await library.restore('folder', folder.id);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(
        changed.mock.calls[0]![0].filter((path: string) => path.startsWith('/files/entries/')),
      ).toHaveLength(count);
      changed.mockClear();
      await library.updateFile(id(1), { name: 'Renamed.txt' });
      expect(changed).toHaveBeenCalledWith(['/files/library']);
    } finally {
      unsubscribe();
    }
  });

  it('keeps duplicate root files and resolves normalized collisions when moving into folders', async () => {
    const folder = await library.createFolder(null, 'Research');
    await create(1, { filename: 'Café.md' });
    await create(2, { filename: 'CAFE\u0301.md' });
    await library.updateFile(id(1), { folderId: folder.id });
    await library.updateFile(id(2), { folderId: folder.id });
    expect(
      (await library.list({ folderId: folder.id })).items.map((file) => file.name).sort(),
    ).toEqual(['CAFÉ (2).md', 'Café.md']);
    await expect(library.createFolder(folder.id, 'café.md')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    validate();
  });

  it('keeps a stable path and rejects a second writer based on an old version', async () => {
    const folder = await library.createFolder(null, 'Research');
    const original = await create(1, { folderId: folder.id });
    const next = await create(2, {
      baseFileEntryId: original.id,
      baseUpdatedAt: original.updatedAt,
      workspaceFolderId: folder.id,
    });
    await expect(
      create(3, { baseFileEntryId: original.id, baseUpdatedAt: original.updatedAt }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await library.resolvePath(folder.id, './Notes.md')).file?.currentEntryId).toBe(next.id);
    expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2), id(1)]);
    expect((await library.list({ folderId: folder.id })).items).toMatchObject([
      { name: 'Notes.md', versionCount: 2 },
    ]);
    expect((await entries.getById(original.id)).filename).toBe('Notes.md');
    await expect(entries.findById(id(3))).resolves.toBeNull();
    validate();
  });

  it('checks mutable draft revisions and destination ancestry in the commit transaction', async () => {
    const root = await library.createFolder(null, 'Workspace');
    const child = await library.createFolder(root.id, 'Reports');
    const source = await create(1, { folderId: child.id });
    const changed = await entries.withWriteTx((tx) => entries.updateSizeTx(tx, source.id, 9));
    expect(changed.updatedAt).toBeGreaterThan(source.updatedAt);
    await expect(
      entries.withWriteTx((tx) =>
        entries.assertCurrentTx(tx, source.id, { baseUpdatedAt: source.updatedAt }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await library.updateFolder(child.id, { parentId: null });
    await expect(
      create(2, { baseFileEntryId: source.id, workspaceFolderId: root.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(library.createFolder(child.id, 'Late', root.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    validate();
  });

  it('refuses cycles and conflicting path creation without leaving orphan entries', async () => {
    const root = await library.createFolder(null, 'Workspace');
    const child = await library.createFolder(root.id, 'Child');
    await expect(library.updateFolder(root.id, { parentId: child.id })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await create(1, { folderId: root.id, conflictIfExists: true });
    await expect(create(2, { folderId: root.id, conflictIfExists: true })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await library.list({ folderId: root.id })).items).toHaveLength(1);
    validate();
  });

  it('restores the entire subtree and its history, keeping Session bindings until purge', async () => {
    const root = await library.createFolder(null, 'Workspace');
    const child = await library.createFolder(root.id, 'Reports');
    await create(1, { folderId: child.id });
    await create(2, { baseFileEntryId: id(1) });
    database.sqlite
      .exec(`INSERT INTO agent (id, name, order_key, created_at, updated_at) VALUES ('agent', 'Chat', 'a0', 1, 1);
      INSERT INTO agent_session (id, agent_id, last_activity_at, created_at, updated_at) VALUES ('session', 'agent', 1, 1, 1);`);
    await library.bindWorkspace('session', root.id);
    expect(await library.trashFolder(root.id)).toEqual(expect.arrayContaining([id(1), id(2)]));
    expect((await library.workspaceBinding('session'))?.id).toBe(root.id);
    await expect(library.workspace('session')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(entries.findAvailableByIds([id(1), id(2)])).resolves.toEqual([]);
    validate();
    await library.restore('folder', root.id);
    expect((await library.workspace('session'))?.id).toBe(root.id);
    expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2), id(1)]);
    await library.trashFolder(root.id);
    const deletedAt = (await library.folder(root.id))!.deletedAt!;
    const purged = await library.purge({
      kind: 'folder',
      thumbnailEntryId: null,
      id: root.id,
      title: root.name,
      deletedAt,
      size: 10,
    });
    expect(purged?.map((entry) => entry.id)).toEqual(expect.arrayContaining([id(1), id(2)]));
    await expect(library.workspaceBinding('session')).resolves.toBeNull();
    validate();
  });

  it('keeps deleted history recoverable when a cancelled draft has no active predecessor', async () => {
    await create(1);
    await create(2, { baseFileEntryId: id(1) });
    await library.trashFileEntry(id(1), true);
    await entries.delete(id(2));
    expect((await library.list()).items).toEqual([]);
    validate();
    await library.restore('file', id(1));
    expect((await library.list()).items).toMatchObject([{ id: id(1), entry: { id: id(1) } }]);
    validate();
  });

  it('restores a separately deleted version without changing the current path', async () => {
    await create(1);
    await create(2, { baseFileEntryId: id(1) });
    await expect(library.trashFileEntry(id(2), true)).rejects.toThrow();
    await library.trashFileEntry(id(1), true);
    expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2)]);
    await library.restore('version', id(1));
    expect((await library.fileForEntry(id(1)))?.currentEntryId).toBe(id(2));
    validate();
  });

  it('restores into the root when the original parent is unavailable and disambiguates names', async () => {
    const parent = await library.createFolder(null, 'Parent');
    const child = await library.createFolder(parent.id, 'Reports');
    await library.trashFolder(child.id);
    await library.trashFolder(parent.id);
    await library.createFolder(null, 'Reports');
    await library.restore('folder', child.id);
    expect(await library.folder(child.id)).toMatchObject({
      parentId: null,
      name: 'Reports (2)',
      deletedAt: null,
    });
    validate();
  });
});
