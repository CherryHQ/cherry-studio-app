import * as z from 'zod';

import type { RuntimeJsonValue } from '../runtime';

/**
 * `RuntimeTool.inputSchema` is portable JSON Schema handed straight to the
 * model provider, so the zod dialect marker is noise the provider may reject.
 */
export function toRuntimeInputSchema(schema: z.ZodType): RuntimeJsonValue {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema as RuntimeJsonValue;
}
