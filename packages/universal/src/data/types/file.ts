import * as z from 'zod';

import { MessageIdSchema } from './message';

export const TimestampSchema = z.int().nonnegative();

export const CONTENT_HASH_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*):([0-9a-f]+)$/;
export const ContentHashSchema = z
  .string()
  .regex(CONTENT_HASH_PATTERN, 'contentHash must be `{algorithm}:{lowercase hex}`')
  .brand<'ContentHash'>();
export type ContentHash = z.infer<typeof ContentHashSchema>;

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

export const FileEntryIdSchema = z.uuid();
export type FileEntryId = z.infer<typeof FileEntryIdSchema>;

export const FileEntryOriginSchema = z.enum(['internal', 'external']);
export type FileEntryOrigin = z.infer<typeof FileEntryOriginSchema>;

export const CleanupPolicySchema = z.enum(['manual', 'delete_when_unreferenced']);
export type CleanupPolicy = z.infer<typeof CleanupPolicySchema>;

export const AbsoluteFilePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\0'), 'path must not contain null bytes')
  .refine(
    (value) =>
      value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value),
    'path must be an absolute filesystem path',
  );
export type AbsoluteFilePath = z.infer<typeof AbsoluteFilePathSchema>;

const commonEntryFields = {
  cleanupPolicy: CleanupPolicySchema,
  createdAt: TimestampSchema,
  ext: SafeExtSchema.nullable(),
  id: FileEntryIdSchema,
  name: SafeNameSchema,
  updatedAt: TimestampSchema,
} as const;

export const InternalEntrySchema = z.strictObject({
  ...commonEntryFields,
  contentHash: ContentHashSchema.nullable(),
  deletedAt: TimestampSchema.optional(),
  origin: z.literal('internal'),
  size: z.int().nonnegative(),
});

export const ExternalEntrySchema = z.strictObject({
  ...commonEntryFields,
  externalPath: AbsoluteFilePathSchema,
  origin: z.literal('external'),
});

export const FileEntrySchema = z
  .discriminatedUnion('origin', [InternalEntrySchema, ExternalEntrySchema])
  .brand<'FileEntry'>();

export type FileEntry = z.infer<typeof FileEntrySchema>;
export type InternalFileEntry = z.infer<typeof InternalEntrySchema>;
export type ExternalFileEntry = z.infer<typeof ExternalEntrySchema>;

export const DanglingStateSchema = z.enum(['present', 'missing', 'unknown']);
export type DanglingState = z.infer<typeof DanglingStateSchema>;

export type FileEntryHandle = {
  readonly kind: 'entry';
  readonly entryId: FileEntryId;
};

export type FilePathHandle = {
  readonly kind: 'path';
  readonly path: AbsoluteFilePath;
};

export type FileHandle = FileEntryHandle | FilePathHandle;

export const FileEntryHandleSchema = z.strictObject({
  entryId: FileEntryIdSchema,
  kind: z.literal('entry'),
});

export const FilePathHandleSchema = z.strictObject({
  kind: z.literal('path'),
  path: AbsoluteFilePathSchema,
});

export const FileHandleSchema = z.discriminatedUnion('kind', [
  FileEntryHandleSchema,
  FilePathHandleSchema,
]);

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

export const jobSourceType = 'job' as const;
export const jobRoles = ['input', 'mask'] as const;
export const jobRoleSchema = z.enum(jobRoles);
export const jobRefFields = {
  role: jobRoleSchema,
  sourceId: z.uuid(),
  sourceType: z.literal(jobSourceType),
};
export const jobFileRefSchema = createRefSchema(jobRefFields);

function defineSingleFileRef<const TSourceType extends string>(sourceType: TSourceType) {
  const refFields = {
    sourceId: z.string().min(1),
    sourceType: z.literal(sourceType),
  };
  return {
    refFields,
    schema: z.object({ ...refCommonFields, ...refFields }),
    sourceType,
  } as const;
}

export const providerLogoRef = defineSingleFileRef('provider_logo');
export const miniAppLogoRef = defineSingleFileRef('mini_app_logo');

export const STORED_FILE_REF_PREFIX = 'file:';

export function tagStoredFileRef(id: string): string {
  return `${STORED_FILE_REF_PREFIX}${id}`;
}

export const allSourceTypes = [
  chatMessageSourceType,
  paintingSourceType,
  jobSourceType,
  providerLogoRef.sourceType,
  miniAppLogoRef.sourceType,
] as const satisfies readonly string[];
export type FileRefSourceType = (typeof allSourceTypes)[number];
export const FileRefSourceTypeSchema = z.enum(allSourceTypes);

export const FileRefSchema = z.discriminatedUnion('sourceType', [
  chatMessageFileRefSchema,
  paintingFileRefSchema,
  jobFileRefSchema,
  providerLogoRef.schema,
  miniAppLogoRef.schema,
]);
export type FileRef = z.infer<typeof FileRefSchema>;
