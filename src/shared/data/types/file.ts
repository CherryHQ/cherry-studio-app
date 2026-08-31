import * as z from 'zod';

/**
 * Mobile-native file model.
 *
 * Intentionally diverges from Cherry Desktop's file types: mobile has no
 * external-path entries, no content hashing, no cleanup policies, and no
 * trash lifecycle on the entry itself. Every entry is an immutable
 * Cherry-owned blob; "edits" create new entries (copy-on-write).
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
