import * as z from 'zod';

/** SQLite stores only these opaque references; native storage owns their values. */
export const PluginSecretReferenceSchema = z.strictObject({
  storage: z.literal('secure-store-v1'),
  id: z.string().uuid(),
});
export type PluginSecretReference = z.infer<typeof PluginSecretReferenceSchema>;
