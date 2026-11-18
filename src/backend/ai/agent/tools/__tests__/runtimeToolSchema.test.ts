import * as z from 'zod';

import { toRuntimeInputSchema, toolValidationError } from '../runtimeToolSchema';

describe('toRuntimeInputSchema', () => {
  test('drops what only repeats a type and keeps real constraints', () => {
    const schema = z.object({
      at: z.iso.datetime(),
      id: z.uuid(),
      code: z.string().regex(/^[A-Z]{3}$/),
      limit: z.number().int(),
      page: z.number().int().min(1).max(50),
      pattern: z.string(),
    });

    expect(toRuntimeInputSchema(schema)).toEqual({
      type: 'object',
      properties: {
        at: { type: 'string', format: 'date-time' },
        id: { type: 'string', format: 'uuid' },
        code: { type: 'string', pattern: '^[A-Z]{3}$' },
        limit: { type: 'integer' },
        page: { type: 'integer', minimum: 1, maximum: 50 },
        pattern: { type: 'string' },
      },
      required: ['at', 'id', 'code', 'limit', 'page', 'pattern'],
      additionalProperties: false,
    });
  });
});

test('returns only bounded error paths and constraints for large invalid payloads', () => {
  const parsed = z
    .array(z.strictObject({ width: z.number().max(80) }))
    .safeParse(Array.from({ length: 50 }, () => ({ width: 110, data: 'PRIVATE'.repeat(10_000) })));
  if (parsed.success) throw new Error('Expected invalid input');
  const error = toolValidationError(parsed.error);
  expect(error.length).toBeLessThanOrEqual(2000);
  expect(error).toContain('0.width');
  expect(error).toContain('80');
  expect(error).toContain('more errors omitted');
  expect(error).not.toContain('PRIVATE');
});
