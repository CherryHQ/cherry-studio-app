import * as z from 'zod';

const metadataValue = z
  .string()
  .max(32 * 1024)
  .regex(/^[\x21\x23-\x5b\x5d-\x7e"]*$/);

/** GB 45438—2025 Annex E; container adapters own the enclosing AIGC property. */
export const AiContentLabelSchema = z.strictObject({
  Label: z.enum(['1', '2', '3']),
  ContentProducer: metadataValue,
  ProduceID: metadataValue,
  ReservedCode1: metadataValue,
  ContentPropagator: metadataValue,
  PropagateID: metadataValue,
  ReservedCode2: metadataValue,
});
export type AiContentLabel = z.infer<typeof AiContentLabelSchema>;

/** Source facts survive transformations, including formats without an in-file carrier. */
export const AiContentSchema = z.strictObject({
  version: z.literal(1),
  source: z.enum(['generated', 'inherited']),
  /** AI origin may be known even when the upstream service supplied no usable label. */
  label: AiContentLabelSchema.nullable(),
});
export type AiContent = z.infer<typeof AiContentSchema>;
export type AiContentOperation = 'generate' | 'edit';

export function inheritAiContent(label: AiContentLabel): AiContent {
  return AiContentSchema.parse({ version: 1, source: 'inherited', label });
}
