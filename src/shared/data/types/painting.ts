import * as z from 'zod';

export const PaintingFilesSchema = z.strictObject({
  input: z.array(z.string()),
  output: z.array(z.string()),
});
export type PaintingFiles = z.infer<typeof PaintingFilesSchema>;

export const PaintingSchema = z.strictObject({
  boardId: z.string(),
  /** Human-written request when it differs from the model prompt; null otherwise. */
  brief: z.string().nullable(),
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

export const PaintingBoardSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  /** The node the user last focused; may name a painting deleted since. */
  focusPaintingId: z.string().nullable(),
  id: z.string(),
  title: z.string(),
  updatedAt: z.iso.datetime(),
});

export type PaintingBoard = z.infer<typeof PaintingBoardSchema>;

export type UpdatePaintingBoardDto = {
  focusPaintingId?: string | null;
  title?: string;
};

export const paintingFileRoles = ['input', 'output'] as const;
export type PaintingFileRole = (typeof paintingFileRoles)[number];
