import type { TextContent } from '@earendil-works/pi-ai';
import * as z from 'zod';

import { FileEntryIdSchema } from '@/shared/data/types/file';

export const PiProviderDocumentSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  mediaType: z.string(),
  revision: z.number().optional(),
});

/** Host-prepared metadata survives Pi's JSON storage; it is never parsed from user text. */
export type PiProviderDocument = TextContent & {
  cherryProviderDocument?: z.infer<typeof PiProviderDocumentSchema>;
};
