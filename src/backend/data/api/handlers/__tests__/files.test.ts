import { FileEntrySchema } from '@cherrystudio/universal/data/types/file';

import { createFileHandlers } from '../files';

const entryId = '00000000-0000-7000-8000-000000000001';
const missingId = '00000000-0000-7000-8000-000000000002';
const entry = FileEntrySchema.parse({
  cleanupPolicy: 'delete_when_unreferenced',
  contentHash: null,
  createdAt: 1,
  ext: 'pdf',
  id: entryId,
  name: 'brief',
  origin: 'internal',
  size: 10,
  updatedAt: 1,
});

describe('file Data API handlers', () => {
  function createHandlers() {
    const entries = {
      findInternalByContentHash: jest.fn(async () => []),
      get: jest.fn(async () => null),
      getById: jest.fn(async () => ({ id: entryId })),
      getStats: jest.fn(async () => ({ activeTotal: 0, extCounts: [], trashTotal: 0 })),
      listCursor: jest.fn(async () => ({ items: [], total: 0 })),
    };
    const content = {
      discardUnreferenced: jest.fn(async () => false),
      import: jest.fn(async () => ({ entry, uri: 'file:///managed.pdf' })),
      resolve: jest.fn(async () => null),
      resolveRenderableUri: jest.fn(async () => undefined),
    };
    const refs = {
      countByEntryIds: jest.fn(async () => new Map([[entryId, 2]])),
      findByEntryId: jest.fn(async () => []),
      findBySource: jest.fn(async () => []),
    };
    return {
      content,
      entries,
      handlers: createFileHandlers(entries as never, refs as never, content),
      refs,
    };
  }

  it('validates and delegates desktop-aligned entry queries', async () => {
    const { entries, handlers } = createHandlers();

    await handlers['/files/entries'].GET({ query: { limit: 10, sortBy: 'name' } });
    expect(entries.listCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, sortBy: 'name' }),
    );
    await handlers['/files/entries/by-content-hash'].GET({
      query: { contentHash: 'sha256:abcd' },
    });
    expect(entries.findInternalByContentHash).toHaveBeenCalledWith('sha256:abcd');
    expect(() => handlers['/files/entries/:id'].GET({ params: { id: 'not-a-uuid' } })).toThrow();
    expect(entries.getById).not.toHaveBeenCalled();
  });

  it('returns zero rows explicitly in ref-count responses', async () => {
    const { handlers, refs } = createHandlers();

    await expect(
      handlers['/files/entries/ref-counts'].GET({
        query: { entryIds: [entryId, missingId] },
      }),
    ).resolves.toEqual([
      { entryId, refCount: 2 },
      { entryId: missingId, refCount: 0 },
    ]);
    expect(refs.countByEntryIds).toHaveBeenCalledWith([entryId, missingId]);
  });

  it('validates source refs and preserves mobile URI compatibility routes', async () => {
    const { content, handlers, refs } = createHandlers();

    await handlers['/files/refs'].GET({
      query: { sourceId: 'provider', sourceType: 'provider_logo' },
    });
    expect(refs.findBySource).toHaveBeenCalledWith({
      sourceId: 'provider',
      sourceType: 'provider_logo',
    });
    expect(() =>
      handlers['/files/refs'].GET({
        query: { sourceId: 'source', sourceType: 'temp_session' as never },
      }),
    ).toThrow();

    await handlers['/files/:id/renderable-uri'].GET({ params: { id: entryId } });
    await handlers['/files/:id/resolved'].GET({ params: { id: entryId } });
    expect(content.resolveRenderableUri).toHaveBeenCalledWith(entryId);
    expect(content.resolve).toHaveBeenCalledWith(entryId);
  });

  it('validates and delegates mobile file imports and safe discards', async () => {
    const { content, handlers } = createHandlers();

    await handlers['/files/import'].POST({
      body: { name: 'brief.pdf', uri: 'file:///picker/brief.pdf' },
    });
    expect(content.import).toHaveBeenCalledWith({
      name: 'brief.pdf',
      uri: 'file:///picker/brief.pdf',
    });

    await expect(handlers['/files/:id'].DELETE({ params: { id: entryId } })).resolves.toEqual({
      deleted: false,
    });
    expect(content.discardUnreferenced).toHaveBeenCalledWith(entryId);
    await expect(handlers['/files/:id'].DELETE({ params: { id: 'invalid' } })).rejects.toThrow();
    expect(() => handlers['/files/import'].POST({ body: { uri: '' } })).toThrow();
  });
});
