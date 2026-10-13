import * as z from 'zod';

import { FileEntryIdSchema } from '@/shared/data/types/file';

/** Crop fractions address the bounding frame after rotation, mirroring and perspective. */
export const FileImageEditSchema = z.strictObject({
  crop: z
    .strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine((crop) => crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  straighten: z.number().min(-45).max(45).default(0),
  horizontal: z.number().min(-45).max(45).default(0),
  vertical: z.number().min(-45).max(45).default(0),
  flipHorizontal: z.boolean().default(false),
  flipVertical: z.boolean().default(false),
});

export const EditFileImageInputSchema = FileImageEditSchema.extend({
  fileEntryId: FileEntryIdSchema,
});
export type ImageEditInput = z.input<typeof FileImageEditSchema>;
export type EditFileImageInput = z.input<typeof EditFileImageInputSchema>;

/** GIF and vector formats retain their ordinary preview, without destructive flattening. */
export function canEditFileImage(mediaType: string): boolean {
  return mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/webp';
}
