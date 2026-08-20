import * as z from 'zod';

import { MessageIdSchema } from './message';

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

export const FileEntryIdSchema = z.uuid();
export type FileEntryId = z.infer<typeof FileEntryIdSchema>;

export const FileEntrySchema = z
  .strictObject({
    createdAt: TimestampSchema,
    /** User-visible name including extension, e.g. `report.pdf`. */
    filename: SafeNameSchema,
    id: FileEntryIdSchema,
    mediaType: MediaTypeSchema,
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

// ============================================================================
// Business references
//
// Pure usage index: reference rows never drive file lifecycle (no ref-counted
// deletion, no GC). They exist so future surfaces can answer "which owners use
// this file" (deletion warnings, usage navigation) and so topic fork can copy
// associations. Every persistent source type registers a table in
// `persistentFileRefTablesBySourceType`.
// ============================================================================

export const refCommonFields = Object.freeze({
  createdAt: TimestampSchema,
  fileEntryId: FileEntryIdSchema,
  id: z.uuidv4(),
  updatedAt: TimestampSchema,
});

export type BusinessRefShape = {
  role: z.ZodEnum;
  sourceId: z.ZodType<string>;
  sourceType: z.ZodLiteral<string>;
};

export const createRefSchema = <TShape extends BusinessRefShape>(
  shape: TShape,
): z.ZodObject<typeof refCommonFields & TShape> =>
  z.object({
    ...refCommonFields,
    ...shape,
  });

export const chatMessageSourceType = 'chat_message' as const;
export const chatMessageRoles = ['attachment'] as const;
export const chatMessageRoleSchema = z.enum(chatMessageRoles);
export const chatMessageRefFields = {
  role: chatMessageRoleSchema,
  sourceId: MessageIdSchema,
  sourceType: z.literal(chatMessageSourceType),
};
export const chatMessageFileRefSchema = createRefSchema(chatMessageRefFields);

export const paintingSourceType = 'painting' as const;
export const paintingRoles = ['output', 'input'] as const;
export const paintingRoleSchema = z.enum(paintingRoles);
export const paintingRefFields = {
  role: paintingRoleSchema,
  sourceId: z.uuidv4(),
  sourceType: z.literal(paintingSourceType),
};
export const paintingFileRefSchema = createRefSchema(paintingRefFields);

export const allSourceTypes = [
  chatMessageSourceType,
  paintingSourceType,
] as const satisfies readonly string[];
export type FileRefSourceType = (typeof allSourceTypes)[number];
export const FileRefSourceTypeSchema = z.enum(allSourceTypes);

export const FileRefSchema = z.discriminatedUnion('sourceType', [
  chatMessageFileRefSchema,
  paintingFileRefSchema,
]);
export type FileRef = z.infer<typeof FileRefSchema>;
