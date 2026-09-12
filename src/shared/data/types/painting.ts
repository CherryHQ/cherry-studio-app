import * as z from 'zod';

export const PaintingFilesSchema = z.strictObject({
  input: z.array(z.string()),
  output: z.array(z.string()),
});
export type PaintingFiles = z.infer<typeof PaintingFilesSchema>;

export const PaintingSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  files: PaintingFilesSchema,
  id: z.string(),
  modelId: z.string().nullable(),
  orderKey: z.string().min(1),
  prompt: z.string(),
  providerId: z.string(),
  updatedAt: z.iso.datetime(),
});

export type Painting = z.infer<typeof PaintingSchema>;

export const paintingFileRoles = ['input', 'output'] as const;
export type PaintingFileRole = (typeof paintingFileRoles)[number];
