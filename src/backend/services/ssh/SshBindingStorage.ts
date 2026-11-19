import { Directory } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';
import * as z from 'zod';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { getStorageBoot, storageDirectory } from '@/backend/data/storage/storagePaths';
import { SshError } from '@/shared/data/types/ssh';

const schema = z.strictObject({
  version: z.literal(1),
  bindings: z
    .array(z.strictObject({ contextId: z.string().min(1).max(200), profileId: z.uuid() }))
    .max(64),
});
type Binding = z.infer<typeof schema>['bindings'][number];
type Storage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

export class SshBindingStorage {
  constructor(private storage?: Storage) {}

  private getStorage(): Storage {
    if (!this.storage) {
      const directory = new Directory(storageDirectory(), 'ssh');
      directory.create({ intermediates: true, idempotent: true });
      this.storage = createMMKV({
        id: `cherry-ssh-bindings-${getStorageBoot().storageId}`,
        path: decodeURIComponent(new URL(directory.uri).pathname),
      });
    }
    return this.storage;
  }

  read(): Binding[] {
    try {
      const raw = this.getStorage().getString('bindings');
      if (raw === undefined) return [];
      if (new TextEncoder().encode(raw).length > 1024 * 1024) throw new Error();
      const { bindings } = schema.parse(JSON.parse(raw));
      if (new Set(bindings.map((item) => item.contextId)).size !== bindings.length)
        throw new Error();
      return bindings;
    } catch {
      throw new SshError('storage');
    }
  }

  write(bindings: Binding[]): void {
    storageMutationGate.assertWritable();
    try {
      const raw = JSON.stringify(schema.parse({ version: 1, bindings }));
      if (new TextEncoder().encode(raw).length > 1024 * 1024) throw new Error();
      this.getStorage().set('bindings', raw);
    } catch {
      throw new SshError('storage');
    }
  }
}
