import type { SQLInputValue } from 'node:sqlite';

import type { DbService } from '@/backend/data/db/DbService';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { createServiceTestDatabase } from '@/backend/data/serviceTestDatabase';
import { subscribeFileChanges } from '@/backend/services/file/fileStorage';
import { TrashRuntime } from '@/backend/services/trash';

import type { RuntimeTool, RuntimeToolCall } from '../../runtime';
import { createFileLibraryManagementTools } from '../fileLibraryManagementTools';

const id = (n: number) => `00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`;

describe('Agent file-library management', () => {
  let database: ReturnType<typeof createServiceTestDatabase>;
  let library: FileLibraryService;
  let entries: FileEntryService;
  let tools: RuntimeTool[];

  beforeEach(() => {
    database = createServiceTestDatabase();
    const dbService = {
      ...database.dbService,
      getSqlite: () => ({
        getAllAsync: async (sql: string, params: SQLInputValue[]) =>
          database.sqlite.prepare(sql).all(...params),
      }),
    } as unknown as DbService;
    library = new FileLibraryService(dbService);
    entries = new FileEntryService(dbService);
    tools = createFileLibraryManagementTools(library, new TrashRuntime(dbService));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.sqlite.close();
  });

  const createFile = (
    n: number,
    placement: Partial<Parameters<FileEntryService['create']>[0]> = {},
  ) =>
    entries.create({
      id: id(n),
      filename: 'Notes.md',
      mediaType: 'text/markdown',
      size: 5,
      provenance: 'generated',
      ...placement,
    });

  async function call(
    name: string,
    input: RuntimeToolCall['input'],
    signal = new AbortController().signal,
  ) {
    const tool = tools.find((item) => item.providerName === name);
    if (!tool) throw new Error(`Missing tool: ${name}`);
    return tool.execute({ input, signal, toolCallId: 'call', turnId: 'turn' });
  }

  it('finds duplicate folder names with parent identities and bounded pages, excluding trash', async () => {
    const first = await library.createFolder(null, 'First');
    const second = await library.createFolder(null, 'Second');
    const a = await library.createFolder(first.id, 'Café');
    const b = await library.createFolder(second.id, 'Café');
    const deleted = await library.createFolder(null, 'Café');
    await library.trashFolder(deleted.id);

    const page1 = await call('library_list_folders', { query: 'CAFE\u0301', limit: 1 });
    const page2 = await call('library_list_folders', { query: 'CAFE\u0301', limit: 1, page: 2 });
    expect(page1.value).toMatchObject({ folders: [expect.any(Object)], nextPage: 2 });
    expect(page2.value).toMatchObject({ folders: [expect.any(Object)], nextPage: null });
    const pages = [page1.value, page2.value] as {
      folders: { id: string; parentId: string; name: string }[];
    }[];
    expect(pages.flatMap((page) => page.folders)).toEqual(
      expect.arrayContaining([
        { id: a.id, parentId: first.id, name: 'Café' },
        { id: b.id, parentId: second.id, name: 'Café' },
      ]),
    );
    const children = await call('library_list_folders', { parent_id: second.id });
    expect(children.value).toEqual({
      folders: [{ id: b.id, parentId: second.id, name: 'Café' }],
      nextPage: null,
    });
  });

  it('moves a whole subtree, reports collision suffixes, and rejects cycles and deleted destinations', async () => {
    const source = await library.createFolder(null, 'Reports');
    const child = await library.createFolder(source.id, 'Drafts');
    const destination = await library.createFolder(null, 'Archive');
    await library.createFolder(destination.id, 'Reports');
    await createFile(1, { folderId: child.id });
    await createFile(2, { baseFileEntryId: id(1) });

    const result = await call('library_move_item', {
      kind: 'folder',
      id: source.id,
      destination_folder_id: destination.id,
    });
    expect(result.value).toMatchObject({
      status: 'moved',
      item: { id: source.id, name: 'Reports (2)', parentId: destination.id },
    });
    expect(
      (await library.resolvePath(destination.id, 'Reports (2)/Drafts/Notes.md')).file?.id,
    ).toBe(id(1));
    expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2), id(1)]);
    await expect(
      call('library_move_item', {
        kind: 'folder',
        id: destination.id,
        destination_folder_id: child.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const deleted = await library.createFolder(null, 'Deleted');
    await library.trashFolder(deleted.id);
    await expect(
      call('library_move_item', {
        kind: 'folder',
        id: source.id,
        destination_folder_id: deleted.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await library.folder(source.id)).toMatchObject({ parentId: destination.id });
  });

  it('moves and renames logical files without changing version content, rejecting conflicting names and paths', async () => {
    const destination = await library.createFolder(null, 'Archive');
    await createFile(1);
    await createFile(2, { baseFileEntryId: id(1) });
    await createFile(3, { folderId: destination.id });
    const moved = await call('library_move_item', {
      kind: 'file',
      id: id(1),
      destination_folder_id: destination.id,
    });
    expect(moved.value).toMatchObject({
      item: { id: id(1), fileEntryId: id(2), name: 'Notes (2).md', folderId: destination.id },
    });
    await expect(
      call('library_rename_item', {
        kind: 'file',
        id: id(1),
        name: 'Notes.md',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      call('library_rename_item', {
        kind: 'file',
        id: id(1),
        name: '../Notes.md',
      }),
    ).rejects.toThrow();
    await call('library_rename_item', { kind: 'file', id: id(1), name: 'Summary.md' });
    expect(await library.file(id(1))).toMatchObject({
      name: 'Summary.md',
      folderId: destination.id,
    });
    expect((await library.history(id(1))).map((entry) => entry.filename)).toEqual([
      'Notes.md',
      'Notes.md',
    ]);

    await call('library_rename_item', { kind: 'folder', id: destination.id, name: 'Saved' });
    await call('library_move_item', { kind: 'file', id: id(1), destination_folder_id: null });
    expect(await library.file(id(1))).toMatchObject({ name: 'Summary.md', folderId: null });
    expect(await library.folder(destination.id)).toMatchObject({ name: 'Saved', parentId: null });
  });

  it('trashes all versions by logical file id and restores them with subscriber notifications', async () => {
    await createFile(1);
    await createFile(2, { baseFileEntryId: id(1) });
    // A version id must not accidentally target a different logical identity.
    await expect(call('library_trash_item', { kind: 'file', id: id(2) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const changed = jest.fn();
    const unsubscribe = subscribeFileChanges(changed);
    try {
      const trashed = await call('library_trash_item', { kind: 'file', id: id(1) });
      expect(trashed).toEqual({
        value: { status: 'trashed', kind: 'file', id: id(1) },
        artifacts: [],
      });
      expect(await entries.findAvailableByIds([id(1), id(2)])).toEqual([]);
      expect(changed.mock.calls.flat()).toEqual(expect.arrayContaining([id(1), id(2)]));
      const trash = await call('library_list_trash', {});
      expect(trash.value).toMatchObject({
        items: [{ kind: 'file', id: id(1), name: 'Notes.md' }],
        nextCursor: null,
      });
      changed.mockClear();
      await call('library_restore_item', { kind: 'file', id: id(1) });
      expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2), id(1)]);
      expect(changed.mock.calls.flat()).toEqual(expect.arrayContaining([id(1), id(2)]));
      expect((await call('library_list_trash', {})).value).toEqual({ items: [], nextCursor: null });
    } finally {
      unsubscribe();
    }
  });

  it('restores a folder subtree to root when its former parent is deleted', async () => {
    const parent = await library.createFolder(null, 'Parent');
    const child = await library.createFolder(parent.id, 'Reports');
    await createFile(1, { folderId: child.id });
    await createFile(2, { baseFileEntryId: id(1) });
    await call('library_trash_item', { kind: 'folder', id: child.id });
    await call('library_trash_item', { kind: 'folder', id: parent.id });
    await library.createFolder(null, 'Reports');
    const first = await call('library_list_trash', { limit: 1 });
    const firstPage = first.value as { items: { id: string }[]; nextCursor: string };
    const next = await call('library_list_trash', { limit: 1, cursor: firstPage.nextCursor });
    const secondPage = next.value as { items: { id: string }[]; nextCursor: null };
    expect([...firstPage.items, ...secondPage.items].map((item) => item.id).sort()).toEqual(
      [parent.id, child.id].sort(),
    );
    expect(secondPage.nextCursor).toBeNull();
    await call('library_restore_item', { kind: 'folder', id: child.id });
    expect(await library.folder(child.id)).toMatchObject({
      parentId: null,
      name: 'Reports (2)',
      deletedAt: null,
    });
    expect((await library.history(id(1))).map((entry) => entry.id)).toEqual([id(2), id(1)]);
  });

  it('does not mutate after cancellation, including cancellation during file lookup', async () => {
    await createFile(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      call(
        'library_rename_item',
        { kind: 'file', id: id(1), name: 'Changed.md' },
        controller.signal,
      ),
    ).rejects.toThrow();
    const duringLookup = new AbortController();
    // The trash runtime owns its own library service, so intercept every instance.
    const read = FileLibraryService.prototype.file;
    jest
      .spyOn(FileLibraryService.prototype, 'file')
      .mockImplementation(async function (this: FileLibraryService, fileId) {
        const file = await read.call(this, fileId);
        duringLookup.abort();
        return file;
      });
    await expect(
      call('library_trash_item', { kind: 'file', id: id(1) }, duringLookup.signal),
    ).rejects.toThrow();
    expect(await read.call(library, id(1))).toMatchObject({ name: 'Notes.md', deletedAt: null });
  });
});
