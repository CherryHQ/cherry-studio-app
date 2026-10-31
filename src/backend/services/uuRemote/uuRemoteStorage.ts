import * as SecureStore from 'expo-secure-store';
import * as z from 'zod';

import { UuRemoteError } from '@/shared/contracts/uuRemote';
import { sha256HexOfText } from '@/shared/utils/sha256';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const PENDING_KEY = 'uu-remote.pending';
const IdentifierSchema = z.string().min(1).max(8192);
const TargetSchema = z.discriminatedUnion('page', [
  z.object({
    page: z.literal('chat'),
    connectionId: IdentifierSchema,
    agentId: IdentifierSchema.optional(),
    sessionId: IdentifierSchema.optional(),
    draftId: IdentifierSchema.optional(),
  }),
  z.object({ page: z.literal('device'), connectionId: IdentifierSchema }),
]);
const PendingSchema = z.object({
  kind: z.enum(['bind', 'control']),
  nonce: IdentifierSchema,
  target: TargetSchema,
  createdAt: z.number().finite(),
});

export type UuRemotePending = z.infer<typeof PendingSchema>;
export type UuRemoteStorage = typeof uuRemoteStorage;

async function read<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const value = await SecureStore.getItemAsync(key, OPTIONS);
    return value ? schema.parse(JSON.parse(value)) : null;
  } catch {
    throw new UuRemoteError('failed');
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key, OPTIONS);
    else await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
  } catch {
    throw new UuRemoteError('failed');
  }
}

/** Device-local bindings and one pending handoff survive a process restart in the other app. */
export const uuRemoteStorage = {
  readBinding: (connectionId: string) =>
    read(`uu-remote.binding.${sha256HexOfText(connectionId)}`, IdentifierSchema),
  writeBinding: (connectionId: string, deviceId: string | null) =>
    write(`uu-remote.binding.${sha256HexOfText(connectionId)}`, deviceId),
  readPending: () => read(PENDING_KEY, PendingSchema),
  writePending: (pending: UuRemotePending | null) => write(PENDING_KEY, pending),
};
