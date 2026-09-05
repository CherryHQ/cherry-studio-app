import * as z from 'zod';

/**
 * Mobile-native file model.
 *
 * Intentionally diverges from Cherry Desktop's file types: mobile has no
 * external-path entries, no content hashing, no cleanup policies, and no
 * trash lifecycle on the entry itself. Every entry is a Cherry-owned blob that
 * is immutable once the Agent turn producing it ends; that turn may rewrite its
 * own draft, and any other "edit" creates a new version entry.
 */

export const TimestampSchema = z.int().nonnegative();

export const SafeNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('\0'), 'Name must not contain null bytes')
  .refine((value) => !/[/\\]/.test(value), 'Name must not contain path separators')
  .refine((value) => !/^\.\.?$/.test(value), 'Name must not be . or ..')
  .refine((value) => value.trim().length > 0, 'Name must not be all whitespace');

export const SafeExtSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[.\s/\\\0]/.test(value), 'Extension contains unsafe characters');

/** IANA media type, e.g. `image/jpeg`, `application/pdf`. */
export const MediaTypeSchema = z
  .string()
  .max(255)
  .regex(/^[^\s/]+\/[^\s/]+$/, 'mediaType must be `type/subtype`');
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

/**
 * Stable provenance retained after a file leaves its originating message or
 * workflow. `unknown` is a real state, not a placeholder: rows imported before
 * this field existed, and rows that will arrive from a peer with no provenance
 * concept of its own, genuinely have no proven origin. Presenting those as
 * `imported` would state something the data does not support.
 */
export const FileEntryProvenanceSchema = z.enum(['generated', 'imported', 'unknown']);
export type FileEntryProvenance = z.infer<typeof FileEntryProvenanceSchema>;

export const FileEntryIdSchema = z.uuid();
export type FileEntryId = z.infer<typeof FileEntryIdSchema>;

export const FileEntrySchema = z
  .strictObject({
    createdAt: TimestampSchema,
    /** User-visible name including extension, e.g. `report.pdf`. */
    filename: SafeNameSchema,
    id: FileEntryIdSchema,
    mediaType: MediaTypeSchema,
    /** How the bytes came to exist: imported by the user, or produced for them. */
    provenance: FileEntryProvenanceSchema,
    /** File size in bytes. */
    size: z.int().nonnegative(),
    updatedAt: TimestampSchema,
  })
  .brand<'FileEntry'>();
export type FileEntry = z.infer<typeof FileEntrySchema>;

/**
 * Lowercased extension of a filename without the leading dot, or null when the
 * filename has none. A leading dot alone (`.gitignore`) does not count as an
 * extension, and an extension that fails `SafeExtSchema` counts as none —
 * both rules mirror the import-time filename projection, so the extension
 * derived here always matches the stored blob's on-disk suffix.
 */
export function filenameExtension(filename: string): string | null {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return null;
  const ext = filename.slice(dotIndex + 1).toLowerCase();
  return SafeExtSchema.safeParse(ext).success ? ext : null;
}

// ============================================================================
// Readable names for files Cherry produces
//
// A produced file is named for what it is, never for its id: an imported file
// keeps the name it arrived with, a version carries its number, and a generated
// image is named after its prompt.
// ============================================================================

const FILENAME_MAX_CHARACTERS = 255;
const VERSION_SUFFIX_PATTERN = /^(.*) v(\d+)$/;
const READABLE_NAME_MAX_CHARACTERS = 40;

/**
 * `report.html` → `report v2.html` → `report v3.html`. `taken` are names already
 * in use, so a second edit of the same source does not produce a twin of an
 * existing version; the number, not the id, is what tells the two apart.
 */
export function nextVersionFilename(filename: string, taken?: ReadonlySet<string>): string {
  const extension = filenameExtension(filename);
  const stem = extension ? filename.slice(0, -(extension.length + 1)) : filename;
  const versioned = VERSION_SUFFIX_PATTERN.exec(stem);
  const base = versioned?.[1] ?? stem;
  let version = versioned ? Number(versioned[2]) + 1 : 2;
  let candidate = withFilenameTail(base, ` v${version}`, extension);
  while (taken?.has(candidate)) {
    version += 1;
    candidate = withFilenameTail(base, ` v${version}`, extension);
  }
  return candidate;
}

/**
 * A display name derived from free text such as a prompt: whitespace collapsed,
 * path and control characters removed, cut to a readable length on a word
 * boundary where one exists. `ordinal` distinguishes siblings from one request
 * (`sunset 2.png`); `fallback` names the file when nothing readable remains.
 */
export function readableFilename(
  text: string,
  options: { extension: string; fallback: string; ordinal?: number },
): string {
  const words = text
    .replace(/[\u0000-\u001f\u007f/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(words);
  let base = characters.slice(0, READABLE_NAME_MAX_CHARACTERS).join('');
  if (characters.length > READABLE_NAME_MAX_CHARACTERS) {
    const wordBoundary = base.lastIndexOf(' ');
    if (wordBoundary >= READABLE_NAME_MAX_CHARACTERS / 2) {
      base = base.slice(0, wordBoundary);
    }
  }
  base = base.replace(/[\s.]+$/, '') || options.fallback;
  const ordinal = options.ordinal !== undefined && options.ordinal > 1 ? ` ${options.ordinal}` : '';
  return withFilenameTail(base, ordinal, options.extension);
}

function withFilenameTail(base: string, suffix: string, extension: string | null): string {
  const tail = `${suffix}${extension ? `.${extension}` : ''}`;
  const room = FILENAME_MAX_CHARACTERS - tail.length;
  return SafeNameSchema.parse(`${base.length > room ? base.slice(0, room) : base}${tail}`);
}

// ============================================================================
// Persisted file-entry URL
//
// Message JSON persists file parts by entry id only: `FileUIPart.url` stores
// this sentinel form instead of an absolute sandbox path (which iOS invalidates
// on every container relocation). Consumers resolve the id to a real URI at
// read time.
// ============================================================================

export const FILE_ENTRY_URL_PREFIX = 'cherry://file/';

export function fileEntryUrl(id: FileEntryId): string {
  return `${FILE_ENTRY_URL_PREFIX}${id}`;
}

export function parseFileEntryUrl(url: string): FileEntryId | null {
  if (!url.startsWith(FILE_ENTRY_URL_PREFIX)) {
    return null;
  }
  const parsed = FileEntryIdSchema.safeParse(url.slice(FILE_ENTRY_URL_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

// Owners hold their own file ids — message parts carry them in JSON, a painting
// row carries them in its `files` column. There is no association table and no
// reverse index: nothing needs to ask which owners use a given file, and a file
// outlives every owner that referenced it.
