import {
  FALLBACK_MEDIA_TYPE,
  FILE_ENTRY_URL_PREFIX,
  FileEntryIdSchema,
  FileEntrySchema,
  fileEntryUrl,
  filenameExtension,
  MediaTypeSchema,
  nextVersionFilename,
  parseFileEntryUrl,
  readableFilename,
} from '../file';

const entryId = '00000000-0000-7000-8000-000000000001';

describe('File contract', () => {
  it('validates the flat entry shape and rejects unknown fields', () => {
    const entry = {
      createdAt: 1,
      filename: 'report.pdf',
      id: entryId,
      mediaType: 'application/pdf',
      provenance: 'generated',
      size: 4,
      updatedAt: 2,
    };
    expect(FileEntrySchema.parse(entry)).toEqual(entry);
    expect(FileEntrySchema.safeParse({ ...entry, ext: 'pdf' }).success).toBe(false);
    expect(FileEntrySchema.safeParse({ ...entry, filename: 'a/b.pdf' }).success).toBe(false);
    expect(FileEntrySchema.safeParse({ ...entry, provenance: 'remote' }).success).toBe(false);
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
});

describe('nextVersionFilename', () => {
  it.each([
    ['report.html', 'report v2.html'],
    ['report v2.html', 'report v3.html'],
    ['report v9.html', 'report v10.html'],
    ['notes', 'notes v2'],
    ['archive.tar.gz', 'archive.tar v2.gz'],
    ['plan v1.5.md', 'plan v1.5 v2.md'],
  ])('versions %s as %s', (source, expected) => {
    expect(nextVersionFilename(source)).toBe(expected);
  });

  it('keeps the result within the filename limit', () => {
    const name = nextVersionFilename(`${'a'.repeat(252)}.md`);
    expect(name).toHaveLength(255);
    expect(name.endsWith(' v2.md')).toBe(true);
  });
});

describe('readableFilename', () => {
  const options = { extension: 'png', fallback: 'Image' };

  it('names a file after its text with whitespace collapsed', () => {
    expect(readableFilename('  a cat\n  on the   moon ', options)).toBe('a cat on the moon.png');
    expect(readableFilename('一只在月光下奔跑的猫', options)).toBe('一只在月光下奔跑的猫.png');
  });

  it('removes path and control characters', () => {
    expect(readableFilename('a/b\\c\u0000d', options)).toBe('a b c d.png');
  });

  it('cuts long text on a word boundary', () => {
    const name = readableFilename(
      'A cinematic photograph of a lighthouse standing in a storm at dusk',
      options,
    );
    expect(name).toBe('A cinematic photograph of a lighthouse.png');
  });

  it('cuts long unbroken text at the character limit', () => {
    expect(readableFilename('x'.repeat(100), options)).toBe(`${'x'.repeat(40)}.png`);
  });

  it('falls back when nothing readable remains and never ends the stem in a dot', () => {
    expect(readableFilename(' ... ', options)).toBe('Image.png');
    expect(readableFilename('v2.', options)).toBe('v2.png');
  });

  it('numbers siblings from the second one', () => {
    expect(readableFilename('sunset', { ...options, ordinal: 1 })).toBe('sunset.png');
    expect(readableFilename('sunset', { ...options, ordinal: 2 })).toBe('sunset 2.png');
  });
});
