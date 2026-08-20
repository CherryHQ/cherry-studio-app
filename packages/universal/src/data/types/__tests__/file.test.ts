import {
  allSourceTypes,
  FALLBACK_MEDIA_TYPE,
  FILE_ENTRY_URL_PREFIX,
  FileEntryIdSchema,
  FileEntrySchema,
  fileEntryUrl,
  filenameExtension,
  FileRefSchema,
  MediaTypeSchema,
  parseFileEntryUrl,
} from '../file';

const entryId = '00000000-0000-7000-8000-000000000001';
const refId = '00000000-0000-4000-8000-000000000002';

describe('File contract', () => {
  it('validates the flat entry shape and rejects unknown fields', () => {
    const entry = {
      createdAt: 1,
      filename: 'report.pdf',
      id: entryId,
      mediaType: 'application/pdf',
      size: 4,
      updatedAt: 2,
    };
    expect(FileEntrySchema.parse(entry)).toEqual(entry);
    expect(FileEntrySchema.safeParse({ ...entry, ext: 'pdf' }).success).toBe(false);
    expect(FileEntrySchema.safeParse({ ...entry, filename: 'a/b.pdf' }).success).toBe(false);
  });

  it('accepts only type/subtype media types', () => {
    expect(MediaTypeSchema.safeParse('image/jpeg').success).toBe(true);
    expect(MediaTypeSchema.safeParse(FALLBACK_MEDIA_TYPE).success).toBe(true);
    expect(MediaTypeSchema.safeParse('image').success).toBe(false);
    expect(MediaTypeSchema.safeParse('image/jpe g').success).toBe(false);
  });

  it('derives lowercased safe extensions matching the stored suffix', () => {
    expect(filenameExtension('Photo.JPG')).toBe('jpg');
    expect(filenameExtension('archive.tar.gz')).toBe('gz');
    expect(filenameExtension('README')).toBeNull();
    expect(filenameExtension('.gitignore')).toBeNull();
    expect(filenameExtension('report.final version')).toBeNull();
  });

  it('round-trips entry ids through the persisted sentinel URL', () => {
    const id = FileEntryIdSchema.parse(entryId);
    const url = fileEntryUrl(id);

    expect(url).toBe(`${FILE_ENTRY_URL_PREFIX}${entryId}`);
    expect(parseFileEntryUrl(url)).toBe(id);
    expect(parseFileEntryUrl(`${FILE_ENTRY_URL_PREFIX}not-a-uuid`)).toBeNull();
    expect(parseFileEntryUrl(`file:///documents/${entryId}`)).toBeNull();
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

  it('exposes exactly the two persistent sources', () => {
    expect(allSourceTypes).toEqual(['chat_message', 'painting']);
  });
});
