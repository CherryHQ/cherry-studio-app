import * as z from 'zod';

import type { RuntimeJsonValue } from '../runtime';

/**
 * `RuntimeTool.inputSchema` is portable JSON Schema handed straight to the
 * model provider, so the zod dialect marker is noise the provider may reject.
 * Every tool re-parses its input with the zod schema, so the model-facing copy
 * also drops what only repeats a type: the regex zod emits beside a `format`
 * and the safe-integer bounds of `.int()`, which cost hundreds of tokens per request.
 */
export function toRuntimeInputSchema(schema: z.ZodType): RuntimeJsonValue {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return compact(jsonSchema) as RuntimeJsonValue;
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  const node = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, child]) =>
      (key === 'pattern' && typeof node.format === 'string') ||
      (key === 'minimum' && child === Number.MIN_SAFE_INTEGER) ||
      (key === 'maximum' && child === Number.MAX_SAFE_INTEGER)
        ? []
        : [[key, compact(child)]],
    ),
  );
}
