import * as z from 'zod';

export const TimestampSchema = z.int().nonnegative();

export const SafeFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('\0'), 'Name must not contain null bytes')
  .refine((value) => !/[/\\]/.test(value), 'Name must not contain path separators')
  .refine((value) => !/^\.\.?$/.test(value), 'Name must not be . or ..')
  .refine((value) => value.trim().length > 0, 'Name must not be all whitespace');

export const SafeFileExtensionSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[.\s/\\\0]/.test(value), 'Extension contains unsafe characters');

export const FileEntryIdSchema = z.uuid();
export type FileEntryId = z.infer<typeof FileEntryIdSchema>;

export const FileEntryOriginSchema = z.enum(['internal', 'external']);
export type FileEntryOrigin = z.infer<typeof FileEntryOriginSchema>;

export const AbsoluteFilePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\0'), 'externalPath must not contain null bytes')
  .refine(
    (value) => value.startsWith('/') || /^[A-Za-z]:\\/.test(value),
    'externalPath must be an absolute filesystem path',
  );

const commonFileEntryFields = {
  createdAt: TimestampSchema,
  ext: SafeFileExtensionSchema.nullable(),
  id: FileEntryIdSchema,
  name: SafeFileNameSchema,
  updatedAt: TimestampSchema,
} as const;

export const InternalFileEntrySchema = z.strictObject({
  ...commonFileEntryFields,
  deletedAt: TimestampSchema.optional(),
  origin: z.literal('internal'),
  size: z.int().nonnegative(),
});

export const ExternalFileEntrySchema = z.strictObject({
  ...commonFileEntryFields,
  externalPath: AbsoluteFilePathSchema,
  origin: z.literal('external'),
});

export const FileEntrySchema = z
  .discriminatedUnion('origin', [InternalFileEntrySchema, ExternalFileEntrySchema])
  .brand<'FileEntry'>();

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type InternalFileEntry = z.infer<typeof InternalFileEntrySchema>;
export type ExternalFileEntry = z.infer<typeof ExternalFileEntrySchema>;

export const chatMessageRoles = ['attachment'] as const;
export type ChatMessageFileRole = (typeof chatMessageRoles)[number];

export type PreparedInternalFile = {
  ext: string | null;
  id: FileEntryId;
  name: string;
  size: number;
  uri: string;
};
