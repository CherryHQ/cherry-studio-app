import * as z from 'zod';

import { toRuntimeInputSchema } from '../../runtimeToolSchema';
import { optionalIsoDate } from '../deviceToolSchemas';

describe('optionalIsoDate', () => {
  test('exposes a required string without the empty enum rejected by Gemini gateways', () => {
    const schema = toRuntimeInputSchema(z.object({ startDate: optionalIsoDate }).strict());

    expect(schema).toEqual({
      type: 'object',
      properties: {
        startDate: { type: 'string', description: expect.any(String) },
      },
      required: ['startDate'],
      additionalProperties: false,
    });
  });

  test.each([
    '',
    '2026-10-19T12:30:00Z',
    '2026-10-19T12:30:00.123+08:00',
    '2026-10-19T12:30:00-05:00',
    '2024-02-29T00:00:00Z',
  ])('preserves the empty sentinel or valid date-time: %j', (value) => {
    expect(optionalIsoDate.parse(value)).toBe(value);
  });

  test.each([
    'not-a-date',
    ' ',
    '2026-10-19',
    '2026-10-19T12:30:00',
    '2026-02-29T00:00:00Z',
    null,
    undefined,
    0,
    true,
    {},
  ])('rejects invalid dates and non-string inputs locally: %j', (value) => {
    expect(optionalIsoDate.safeParse(value).success).toBe(false);
  });
});
