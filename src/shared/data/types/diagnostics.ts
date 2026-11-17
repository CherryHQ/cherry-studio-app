import * as z from 'zod';

/** Optional on historical records. Profile ownership and authenticated account are distinct. */
export const DiagnosticEventContextSchema = z.object({
  profileId: z.string().optional(),
  profileKind: z.enum(['local', 'cloud', 'private']).optional(),
  profileSubjectId: z.string().optional(),
  deploymentId: z.string().optional(),
  organizationId: z.string().optional(),
  profileIssuerHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  accountStatus: z
    .enum(['unknown', 'restoring', 'signed_out', 'signed_in', 'sign_in_required'])
    .optional(),
  accountSubjectId: z.string().optional(),
  accountIssuerHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().optional(),
  buildNumber: z.string().optional(),
  jsVersion: z.string().optional(),
  runtimeVersion: z.string().optional(),
  updateId: z.string().optional(),
  updateChannel: z.string().optional(),
  isEmbeddedLaunch: z.boolean().optional(),
});

export type DiagnosticEventContext = z.infer<typeof DiagnosticEventContextSchema>;
