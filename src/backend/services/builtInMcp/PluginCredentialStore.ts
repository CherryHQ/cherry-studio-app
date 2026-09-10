import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  pluginAuthorizationService,
  type PluginAuthorizationService,
} from '@/backend/data/services/PluginAuthorizationService';
import {
  PluginSecretReferenceSchema,
  type PluginSecretReference,
} from '@/backend/data/services/utils/pluginSecretReferences';
import { PluginError } from '@/shared/contracts/plugins';
import { PluginCredentialSchema, type PluginCredential } from '@/shared/data/types/plugin';

import type { PluginAuthorizationStore } from './pluginDefinition';

type Database = Pick<
  PluginAuthorizationService,
  'connect' | 'disconnect' | 'getCredentialGrant' | 'getCurrentGrant'
>;
type NativeStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const secretKey = (reference: PluginSecretReference) => `plugin-secret.${reference.id}`;

/** Local credentials only. The manager owns this queue and drains it before the database closes. */
export class PluginCredentialStore {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly database: Database = pluginAuthorizationService,
    private readonly native: NativeStorage = SecureStore,
  ) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail
      .catch(() => {})
      .then(async () => {
        if (this.lifetime.signal.aborted)
          throw new PluginError('cancelled', 'Plugin credential storage stopped.');
        try {
          return await operation();
        } catch (error) {
          if (this.lifetime.signal.aborted)
            throw new PluginError('cancelled', 'Plugin credential storage stopped.');
          if (error instanceof PluginError) throw error;
          throw new PluginError('storage', 'Could not access plugin credentials. Connect again.');
        }
      });
    this.tail = result;
    return result;
  }

  async stop() {
    this.lifetime.abort();
    await this.tail.catch(() => {});
  }

  private async read(key: string) {
    const value = await this.native.getItemAsync(key, OPTIONS);
    return value === null ? undefined : PluginCredentialSchema.parse(JSON.parse(value));
  }

  private write(key: string, value: PluginCredential) {
    return this.native.setItemAsync(
      key,
      JSON.stringify(PluginCredentialSchema.parse(value)),
      OPTIONS,
    );
  }

  private async resolveCredential(reference: PluginCredential) {
    const value = await this.read(secretKey(PluginSecretReferenceSchema.parse(reference)));
    if (!value)
      throw new PluginError('authorization', 'Plugin credentials are missing. Connect again.');
    return value;
  }

  private async remove(reference: PluginCredential) {
    // Cleanup cannot undo a committed replacement or revocation. No background retries.
    await this.native
      .deleteItemAsync(secretKey(PluginSecretReferenceSchema.parse(reference)), OPTIONS)
      .catch(() => {});
  }

  getCredentialGrant(pluginId: string, authorizationId: string) {
    return this.run(async () => {
      const row = await this.database.getCredentialGrant(pluginId, authorizationId);
      return { ...row, credential: await this.resolveCredential(row.credential) };
    });
  }

  authorizationStore(
    pluginId: string,
    method: string,
    serverName: string,
  ): PluginAuthorizationStore {
    const applicationKey = `plugin-application.${pluginId}.${method}`;
    return {
      readApplication: () => this.run(() => this.read(applicationKey)),
      writeApplication: (application) =>
        this.run(() =>
          application
            ? this.write(applicationKey, application)
            : this.native.deleteItemAsync(applicationKey, OPTIONS),
        ),
      getGrant: (id) =>
        this.run(async () => {
          const row = await this.database.getCurrentGrant(pluginId, method);
          if (!row || (id && row.id !== id)) return undefined;
          return { id: row.id, credential: await this.resolveCredential(row.credential) };
        }),
      updateCredential: (id, credential, signal) =>
        this.run(async () => {
          signal.throwIfAborted();
          const row = await this.database.getCurrentGrant(pluginId, method);
          if (row?.id !== id) return false;
          signal.throwIfAborted();
          // Replace the entire token bundle in one native item; no second SQLite write.
          await this.write(
            secretKey(PluginSecretReferenceSchema.parse(row.credential)),
            credential,
          );
          return true;
        }),
      commit: (credential, accountLabel, signal) =>
        this.connect(
          {
            pluginId,
            authMethod: method,
            serverName,
            credential,
            accountLabel,
          },
          signal,
        ),
    };
  }

  connect(input: Parameters<PluginAuthorizationService['connect']>[0], callerSignal?: AbortSignal) {
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.lifetime.signal])
      : this.lifetime.signal;
    return this.run(async () => {
      signal.throwIfAborted();
      const previous = await this.database.getCurrentGrant(input.pluginId);
      const reference = { storage: 'secure-store-v1' as const, id: randomUUID() };
      let connection;
      try {
        await this.write(secretKey(reference), input.credential);
        connection = await this.database.connect({ ...input, credential: reference }, signal);
      } catch (error) {
        await this.remove(reference);
        throw error;
      }
      if (previous) await this.remove(previous.credential);
      return connection;
    });
  }

  disconnect(pluginId: string) {
    return this.run(async () => {
      const previous = await this.database.getCurrentGrant(pluginId);
      const result = await this.database.disconnect(pluginId);
      if (previous) await this.remove(previous.credential);
      return result;
    });
  }
}
