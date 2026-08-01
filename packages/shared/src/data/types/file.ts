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

export type ResolvedFile = {
  entry: FileEntry;
  uri: string;
};

export const chatMessageRoles = ['attachment'] as const;
export type ChatMessageFileRole = (typeof chatMessageRoles)[number];

export const tempSessionSourceType = 'temp_session' as const;
export const chatMessageSourceType = 'chat_message' as const;
export const paintingSourceType = 'painting' as const;
export const paintingRoles = ['output', 'input'] as const;

function defineSingleFileRef<const TSourceType extends string>(sourceType: TSourceType) {
  return { sourceType } as const;
}

export const providerLogoRef = defineSingleFileRef('provider_logo');
export const miniAppLogoRef = defineSingleFileRef('mini_app_logo');

export const allFileRefSourceTypes = [
  tempSessionSourceType,
  chatMessageSourceType,
  paintingSourceType,
  providerLogoRef.sourceType,
  miniAppLogoRef.sourceType,
] as const;
export type FileRefSourceType = (typeof allFileRefSourceTypes)[number];
export const FileRefSourceTypeSchema = z.enum(allFileRefSourceTypes);

export type PreparedInternalFile = {
  ext: string | null;
  id: FileEntryId;
  name: string;
  size: number;
  uri: string;
};

const imageFileTypes = [
  { extensions: ['avif'], mediaType: 'image/avif', outputExtension: 'avif' },
  { extensions: ['gif'], mediaType: 'image/gif', outputExtension: 'gif' },
  { extensions: ['heic'], mediaType: 'image/heic', outputExtension: 'heic' },
  { extensions: ['heif'], mediaType: 'image/heif', outputExtension: 'heif' },
  { extensions: ['jpeg', 'jpg'], mediaType: 'image/jpeg', outputExtension: 'jpg' },
  { extensions: ['png'], mediaType: 'image/png', outputExtension: 'png' },
  { extensions: ['webp'], mediaType: 'image/webp', outputExtension: 'webp' },
] as const;
type ImageFileType = (typeof imageFileTypes)[number];

const imageFileTypeByExtension = new Map<string, ImageFileType>(
  imageFileTypes.flatMap((fileType) =>
    fileType.extensions.map((extension) => [extension, fileType] as const),
  ),
);
const imageFileTypeByMediaType = new Map<string, ImageFileType>(
  imageFileTypes.map((fileType) => [fileType.mediaType, fileType] as const),
);

export function isImageFileExtension(extension: string | null | undefined): boolean {
  return extension ? imageFileTypeByExtension.has(extension.toLowerCase()) : false;
}

export function imageMediaTypeFromExtension(extension: string | null | undefined): string {
  return extension
    ? (imageFileTypeByExtension.get(extension.toLowerCase())?.mediaType ?? 'image/*')
    : 'image/*';
}

export function generatedImageExtension(mediaType: string): string {
  return imageFileTypeByMediaType.get(mediaType.toLowerCase())?.outputExtension ?? 'png';
}
