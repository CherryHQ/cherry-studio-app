/**
 * Input primitives shared by the device tools.
 *
 * Every field is required and uses an empty-string or zero sentinel rather than
 * `.optional()`. That is a provider constraint, not a style choice: a strict
 * OpenAI-compatible endpoint rejects a schema whose `required` omits a
 * property, and Gemini rejects the `anyOf: [T, null]` that `.nullable()` emits.
 * A bare required scalar is the only shape every supported endpoint accepts, so
 * each tool maps the sentinel back to "not provided" before calling the device.
 */

import * as z from 'zod';

/** Applied when the model passes the `0` sentinel for `limit`. */
export const DEFAULT_COLLECTION_LIMIT = 100;

export const EMPTY_INPUT_SCHEMA = z.object({}).strict();

export const entityId = z.string().min(1).max(512);
export const optionalEntityId = z.string().max(512);

export const isoDate = z.iso.datetime({ offset: true });
export const optionalIsoDate = z.union([z.literal(''), isoDate]);

export function limit(max: number) {
  return z
    .number()
    .int()
    .refine((value) => value === 0 || (value >= 1 && value <= max), {
      message: `must be 0 for the default, or between 1 and ${max}`,
    });
}

export function text(max: number) {
  return z.string().max(max);
}
