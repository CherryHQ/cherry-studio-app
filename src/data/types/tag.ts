import * as z from 'zod';

export const TagIdSchema = z.uuidv4();
export const TagNameSchema = z.string().trim().min(1).max(64);
export const TagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TagSchema = z.strictObject({
  color: TagColorSchema.nullable(),
  createdAt: z.iso.datetime(),
  id: TagIdSchema,
  name: TagNameSchema,
  updatedAt: z.iso.datetime(),
});
export type Tag = z.infer<typeof TagSchema>;

export const CreateTagSchema = TagSchema.pick({ color: true, name: true })
  .partial()
  .required({ name: true });
export type CreateTagDto = z.infer<typeof CreateTagSchema>;

const UpdateTagSchema = CreateTagSchema.partial();
export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;

export const SyncEntityTagsSchema = z.strictObject({
  tagIds: z
    .array(TagIdSchema)
    .max(100)
    .refine((tagIds) => new Set(tagIds).size === tagIds.length, {
      message: 'Duplicate tag ids are not allowed',
    }),
});
export type SyncEntityTagsDto = z.infer<typeof SyncEntityTagsSchema>;
