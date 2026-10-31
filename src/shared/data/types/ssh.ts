import * as z from 'zod';

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes('\0'));
export const SshProfileFieldsSchema = z.object({
  name: text(100).trim().min(1),
  host: text(253)
    .trim()
    .min(1)
    .refine((value) => !/[\s/@]/.test(value)),
  port: z.number().int().min(1).max(65535),
  username: text(256).trim().min(1),
  authMethod: z.enum(['password', 'privateKey']),
});
export type SshProfileFields = z.infer<typeof SshProfileFieldsSchema>;
export const SshReferenceSchema = z.object({ id: z.uuid(), revision: z.uuid() });
export type SshReference = z.infer<typeof SshReferenceSchema>;
export type SshProfile = SshProfileFields &
  SshReference & {
    fingerprint: string | null;
  };
export const SshCredentialSchema = z.discriminatedUnion('authMethod', [
  z.object({ authMethod: z.literal('password'), password: text(65536).min(1) }),
  z.object({
    authMethod: z.literal('privateKey'),
    privateKey: text(65536).min(1),
    passphrase: text(65536).optional(),
  }),
]);
export type SshCredential = z.infer<typeof SshCredentialSchema>;
export const SaveSshProfileSchema = z.object({
  profile: SshProfileFieldsSchema,
  previous: SshReferenceSchema.optional(),
  credential: SshCredentialSchema.optional(),
});
export type SaveSshProfile = z.infer<typeof SaveSshProfileSchema>;
export const SshCommandSchema = text(32768).min(1);

export const SshErrorCodeSchema = z.enum([
  'unavailable',
  'invalid-input',
  'busy',
  'cancelled',
  'timeout',
  'resolve',
  'connection',
  'handshake',
  'host-key',
  'authentication',
  'channel',
  'command',
  'changed',
  'credential',
  'storage',
]);
export type SshErrorCode = z.infer<typeof SshErrorCodeSchema>;
export class SshError extends Error {
  constructor(readonly code: SshErrorCode) {
    super(`SSH: ${code}`);
    this.name = 'SshError';
  }
}

export type SshCommandResult = {
  state: 'not-started' | 'exited' | 'unknown';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
  error?: SshErrorCode;
};
export type SshOutput = { stream: 'stdout' | 'stderr'; text: string };

/** Local, ephemeral conversation binding. It does not survive process restarts. */
export type SshTarget = {
  /** A fresh identity for each selection or authorization change. */
  selectionId: string;
  profile: SshProfile;
  /** null means every command requires approval. */
  grant: { id: string; expiresAt: number } | null;
};
