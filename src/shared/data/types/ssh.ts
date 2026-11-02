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
  /** '.' keeps the SSH account's default directory; otherwise an absolute POSIX path. */
  remoteDirectory: text(4096)
    .trim()
    .refine((value) => value === '.' || value.startsWith('/'))
    .default('.'),
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
export type SaveSshProfile = z.input<typeof SaveSshProfileSchema>;
export const SshCommandSchema = text(32768).min(1);
export const SshCommandInputSchema = z.strictObject({
  command: SshCommandSchema,
  cwd: text(4096).optional(),
  stdin: text(262144).optional(),
});
export type SshCommandInput = z.infer<typeof SshCommandInputSchema>;
export const SshFilePathSchema = text(4096).min(1);
export const SshFileRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('list'), path: SshFilePathSchema }),
  z.strictObject({ operation: z.literal('read'), path: SshFilePathSchema }),
  z.strictObject({
    operation: z.literal('write'),
    path: SshFilePathSchema,
    content: text(262144),
    overwrite: z.boolean(),
  }),
]);
export type SshFileRequest = z.infer<typeof SshFileRequestSchema>;
export type SshFileEntry = {
  name: string;
  type: 'directory' | 'file' | 'symlink' | 'other';
  size: number | null;
  modifiedAt: number | null;
};
export type SshFileResult = {
  state: 'not-started' | 'completed' | 'unknown';
  path: string;
  entries: SshFileEntry[];
  content: string;
  bytes: number;
  truncated: boolean;
  error?: SshErrorCode;
  diagnostics?: SshDiagnostics;
};
export type SshTransferProgress = { transferred: number; total: number | null };
export type SshAuthenticationRequest = {
  id: string;
  destination: string;
  name: string;
  instruction: string;
  prompts: { text: string; echo: boolean }[];
  expiresAt: number;
};
export type SshDiagnostics = {
  phase: 'connect' | 'handshake' | 'authentication' | 'command' | 'sftp' | 'transfer';
  code: number;
  hostKeyType: number;
  keyExchange: string;
  cipher: string;
  authenticationMethods: string;
  reused: boolean;
};

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
  'sftp',
  'not-found',
  'permission',
  'file-exists',
  'file-too-large',
  'binary-file',
  'path',
  'local-file',
  'authentication-required',
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
  diagnostics?: SshDiagnostics;
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
