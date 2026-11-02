import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';
import * as z from 'zod';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { getStorageBoot, storageDirectory } from '@/backend/data/storage/storagePaths';
import {
  SshError,
  SshProfileFieldsSchema,
  SshReferenceSchema,
  type SshProfile,
  type SshReference,
} from '@/shared/data/types/ssh';

export const SSH_PROFILE_BACKUP_PATH = 'ssh/profiles.json';
const PROFILES_KEY = 'profiles';
export const SSH_PROFILE_SNAPSHOT_MAX_BYTES = 1024 * 1024;
const ProfileRecordSchema = z.strictObject({
  ...SshProfileFieldsSchema.shape,
  ...SshReferenceSchema.shape,
  fingerprint: z.string().max(256).nullable(),
  credentialReference: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
type SshProfileRecord = z.infer<typeof ProfileRecordSchema>;
const StoredProfilesSchema = z.strictObject({
  version: z.literal(1),
  profiles: z.array(ProfileRecordSchema).max(100),
});
const BackupProfilesSchema = StoredProfilesSchema.extend({
  profiles: z.array(ProfileRecordSchema.omit({ credentialReference: true })).max(100),
});

export type SshProfileStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

/** Both device data and portable snapshots reject corrupt or ambiguous profile lists. */
function parseProfiles<T extends { profiles: { id: string }[] }>(
  raw: string,
  schema: z.ZodType<T>,
): T {
  if (new TextEncoder().encode(raw).length > SSH_PROFILE_SNAPSHOT_MAX_BYTES)
    throw new SshError('storage');
  const snapshot = schema.parse(JSON.parse(raw));
  if (new Set(snapshot.profiles.map(({ id }) => id)).size !== snapshot.profiles.length)
    throw new SshError('storage');
  return snapshot;
}

export function parseSshProfileBackup(raw: string) {
  return parseProfiles(raw, BackupProfilesSchema);
}

export function toSshProfile(row: SshProfileRecord): SshProfile {
  const { id, revision, name, host, port, username, authMethod, fingerprint, remoteDirectory } =
    row;
  return { id, revision, name, host, port, username, authMethod, fingerprint, remoteDirectory };
}

/** Durable configuration, isolated from the disposable frontend/backend MMKV caches. */
export class SshProfileService {
  constructor(private storage?: SshProfileStorage) {}

  initialize(): void {
    this.readRecords();
  }

  private getStorage(): SshProfileStorage {
    if (this.storage) return this.storage;
    const boot = getStorageBoot();
    const directory = new Directory(storageDirectory(), 'ssh');
    directory.create({ intermediates: true, idempotent: true });
    const storage = createMMKV({
      id: `cherry-ssh-profiles-${boot.storageId}`,
      path: decodeURIComponent(new URL(directory.uri).pathname),
    });
    // Only seed a restoring generation. The verified JSON remains unchanged for startup
    // hash checks; an ordinary boot never imports an old snapshot over current edits.
    const snapshot = new File(directory, 'profiles.json');
    if (boot.restoring && snapshot.exists) {
      if (snapshot.size > SSH_PROFILE_SNAPSHOT_MAX_BYTES) throw new SshError('storage');
      const profiles = parseSshProfileBackup(snapshot.textSync()).profiles.map((profile) => ({
        ...profile,
        revision: randomUUID(),
        credentialReference: randomUUID(),
      }));
      storage.set(PROFILES_KEY, JSON.stringify({ version: 1, profiles }));
    }
    this.storage = storage;
    return storage;
  }

  private readRecords(): SshProfileRecord[] {
    try {
      const raw = this.getStorage().getString(PROFILES_KEY);
      return raw === undefined ? [] : parseProfiles(raw, StoredProfilesSchema).profiles;
    } catch {
      throw new SshError('storage');
    }
  }

  async list(): Promise<SshProfile[]> {
    return this.readRecords()
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(toSshProfile);
  }

  async getRow(reference: SshReference): Promise<SshProfileRecord> {
    const row = this.readRecords().find(({ id }) => id === reference.id);
    if (!row || row.revision !== reference.revision) throw new SshError('changed');
    return row;
  }

  async save(
    input: Omit<SshProfileRecord, 'id' | 'createdAt' | 'updatedAt'>,
    previous?: SshReference,
  ): Promise<SshProfile> {
    storageMutationGate.assertWritable();
    const records = this.readRecords();
    const current = previous && records.find(({ id }) => id === previous.id);
    if (previous && current?.revision !== previous.revision) throw new SshError('changed');
    if (!previous && records.length >= 100) throw new SshError('busy');
    const record = ProfileRecordSchema.parse({
      ...input,
      id: current ? current.id : randomUUID(),
      createdAt: current ? current.createdAt : Date.now(),
      updatedAt: Date.now(),
    });
    this.writeRecords([...records.filter(({ id }) => id !== record.id), record]);
    return toSshProfile(record);
  }

  async remove(reference: SshReference): Promise<void> {
    storageMutationGate.assertWritable();
    const records = this.readRecords();
    const row = records.find(({ id }) => id === reference.id);
    if (row?.revision !== reference.revision) throw new SshError('changed');
    this.writeRecords(records.filter(({ id }) => id !== reference.id));
  }

  exportSnapshot(): string {
    const profiles = this.readRecords().map(
      ({ credentialReference: _reference, ...profile }) => profile,
    );
    return JSON.stringify({ version: 1, profiles });
  }

  private writeRecords(profiles: SshProfileRecord[]): void {
    try {
      const raw = JSON.stringify({ version: 1, profiles });
      parseProfiles(raw, StoredProfilesSchema);
      this.getStorage().set(PROFILES_KEY, raw);
    } catch {
      throw new SshError('storage');
    }
  }
}
export const sshProfileService = new SshProfileService();
