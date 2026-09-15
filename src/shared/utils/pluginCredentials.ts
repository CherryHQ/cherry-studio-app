import * as z from 'zod';

import type { PluginCredentialField } from '@/shared/data/types/plugin';

/** The same plugin-owned field rules validate the form and the backend workflow. */
export function createPluginCredentialsSchema(fields: readonly PluginCredentialField[]) {
  return z.strictObject(
    Object.fromEntries(
      fields.map((field) => {
        let schema = z.string().trim().min(1).max(field.maxLength);
        if (field.pattern) schema = schema.regex(new RegExp(field.pattern));
        return [field.id, schema] as const;
      }),
    ),
  );
}
