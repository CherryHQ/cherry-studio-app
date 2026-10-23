import { MAX_FILE_MOVE_BATCH_SIZE } from '@/shared/data/types/fileLibrary';

import { createFileHandlers } from '../files';

const entryId = '00000000-0000-7000-8000-000000000001';

describe('file Data API handlers', () => {
  it('validates bounded move requests before any mutation, including an explicit root destination', async () => {
    const results = [{ fileEntryId: entryId, status: 'moved' }];
    const library = { moveFiles: jest.fn(async () => results) };
    const handlers = createFileHandlers({} as never, {} as never, library as never);
    const move = handlers['/files/library/move'].POST;
    for (const body of [
      { fileEntryIds: [], folderId: null },
      {
        fileEntryIds: Array.from({ length: MAX_FILE_MOVE_BATCH_SIZE + 1 }, () => entryId),
        folderId: null,
      },
      { fileEntryIds: ['invalid'], folderId: null },
      { fileEntryIds: [entryId], folderId: 'invalid' },
      { fileEntryIds: [entryId] },
    ])
      expect(() => move({ body } as never)).toThrow();
    expect(library.moveFiles).not.toHaveBeenCalled();
    await expect(move({ body: { fileEntryIds: [entryId], folderId: null } })).resolves.toEqual(
      results,
    );
    expect(library.moveFiles).toHaveBeenCalledWith([entryId], null);
  });

  it('passes the list query through untouched, including an absent one', async () => {
    const page = { items: [] };
    const entries = { listByCursor: jest.fn(async () => page) };
    const handlers = createFileHandlers(entries as never, {} as never);

    await expect(handlers['/files/entries'].GET({ query: { limit: 5 } })).resolves.toBe(page);
    expect(entries.listByCursor).toHaveBeenCalledWith({ limit: 5 });

    // Undefined reaches the service so its own defaults apply.
    await handlers['/files/entries'].GET({});
    expect(entries.listByCursor).toHaveBeenLastCalledWith(undefined);
  });

  it('validates the id before delegating the entry lookup', async () => {
    const entries = { getById: jest.fn(async () => ({ id: entryId })) };
    const handlers = createFileHandlers(entries as never, {} as never);

    await expect(handlers['/files/entries/:id'].GET({ params: { id: entryId } })).resolves.toEqual({
      id: entryId,
    });
    expect(entries.getById).toHaveBeenCalledWith(entryId);

    expect(() => handlers['/files/entries/:id'].GET({ params: { id: 'not-a-uuid' } })).toThrow();
    expect(entries.getById).toHaveBeenCalledTimes(1);
  });
});
