import * as z from 'zod';

import { FileEntryIdSchema } from '@/shared/data/types/file';

/** Coordinates are fractions of the image AFTER its clockwise rotation. */
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
});

export const EditFileImageInputSchema = FileImageEditSchema.extend({
  fileEntryId: FileEntryIdSchema,
});
export type EditFileImageInput = z.infer<typeof EditFileImageInputSchema>;

/** GIF and vector formats retain their ordinary preview, without destructive flattening. */
export function canEditFileImage(mediaType: string): boolean {
  return mediaType === 'image/jpeg' || mediaType === 'image/png' || mediaType === 'image/webp';
}
