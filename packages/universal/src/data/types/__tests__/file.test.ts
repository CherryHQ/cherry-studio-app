import {
  allSourceTypes,
  ContentHashSchema,
  FileEntrySchema,
  FileHandleSchema,
  FileRefSchema,
  tagStoredFileRef,
} from '../file';

const entryId = '00000000-0000-7000-8000-000000000001';
const refId = '00000000-0000-4000-8000-000000000002';

describe('File contract', () => {
  it('validates internal metadata and cleanup policy', () => {
    expect(
      FileEntrySchema.parse({
        cleanupPolicy: 'manual',
        contentHash: 'sha256:abcd',
        createdAt: 1,
        ext: 'png',
        id: entryId,
        name: 'image',
        origin: 'internal',
        size: 4,
        updatedAt: 2,
      }),
    ).toEqual(expect.objectContaining({ cleanupPolicy: 'manual', contentHash: 'sha256:abcd' }));
    expect(ContentHashSchema.safeParse('SHA256:ABCD').success).toBe(false);
  });

  it('keeps entry/path handles as a discriminated union', () => {
    expect(FileHandleSchema.parse({ entryId, kind: 'entry' })).toEqual({ entryId, kind: 'entry' });
    expect(FileHandleSchema.parse({ kind: 'path', path: '/tmp/image.png' })).toEqual({
      kind: 'path',
      path: '/tmp/image.png',
    });
  });

  it.each([
    { role: 'attachment', sourceId: refId, sourceType: 'chat_message' },
    { role: 'input', sourceId: refId, sourceType: 'painting' },
  ])('validates the $sourceType FileRef variant', (source) => {
    expect(
      FileRefSchema.parse({
        ...source,
        createdAt: 1,
        fileEntryId: entryId,
        id: refId,
        updatedAt: 2,
      }),
    ).toEqual(expect.objectContaining(source));
  });

  it('exposes exactly the two persistent sources and file locator helper', () => {
    expect(allSourceTypes).toEqual(['chat_message', 'painting']);
    expect(allSourceTypes).not.toContain('temp_session');
    expect(tagStoredFileRef(entryId)).toBe(`file:${entryId}`);
  });
});
