import { z } from 'zod';

export const VertexAuthFieldsSchema = z.object({
  project: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/),
  location: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/),
  clientEmail: z.string().trim().email(),
  privateKey: z
    .string()
    .trim()
    .regex(/^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----$/),
});
