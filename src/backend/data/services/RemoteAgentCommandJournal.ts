import type { MMKV } from 'react-native-mmkv';

/**
 * Durable outgoing actions, not a cache: synchronous write failures propagate before sending.
 * Pairing generations isolate replacement credentials. No token or session key is stored here.
 */
export class RemoteAgentCommandJournal {
  constructor(
    private readonly storage: Pick<MMKV, 'getString' | 'set' | 'getAllKeys' | 'remove'>,
  ) {}
  read(binding: string): string | undefined {
    return this.storage.getString(binding);
  }
  write(binding: string, serialized: string): void {
    this.storage.set(binding, serialized);
  }
  remove(binding: string): void {
    this.storage.remove(binding);
  }
  removeConnection(connectionId: string): void {
    for (const key of this.storage.getAllKeys()) {
      if (key.startsWith(`${connectionId}:`)) this.storage.remove(key);
    }
  }
}
