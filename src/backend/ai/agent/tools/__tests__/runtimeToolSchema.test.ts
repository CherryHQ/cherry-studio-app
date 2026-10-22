import * as z from 'zod';

import { toRuntimeInputSchema } from '../runtimeToolSchema';

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
