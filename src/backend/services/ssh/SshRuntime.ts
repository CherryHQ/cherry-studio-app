import { toByteArray } from 'base64-js';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as z from 'zod';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { SshProfileService, toSshProfile } from '@/backend/data/services/SshProfileService';
import type {
  KeepAliveLease,
  KeepAliveSource,
} from '@/backend/services/keepAlive/KeepAliveCoordinator';
import type { SshHostProbe, SshModule } from '@/shared/contracts/ssh';
import {
  SaveSshProfileSchema,
  SshCommandSchema,
  SshCredentialSchema,
  SshError,
  SshErrorCodeSchema,
  SshReferenceSchema,
  type SaveSshProfile,
  type SshCommandResult,
  type SshCredential,
  type SshOutput,
  type SshProfile,
  type SshReference,
  type SshTarget,
} from '@/shared/data/types/ssh';

import { getSshNative, type SshNativeOptions } from '../../../../modules/ssh';

const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const secretKey = (id: string) => `ssh-secret.${id}`;
const NativeResultSchema = z.object({
  state: z.enum(['not-started', 'exited', 'unknown', 'probed']),
  stdout: z.string().max(350000),
  stderr: z.string().max(350000),
  exitCode: z.number().int().nullable(),
  truncated: z.boolean(),
  fingerprint: z.string().max(100),
  error: z.union([z.literal(''), SshErrorCodeSchema]),
});
type NativeResult = z.infer<typeof NativeResultSchema>;
type ActiveRun = {
  profileId: string;
  sessionId?: string;
  cancel(): void;
  settled: Promise<unknown>;
};
const sameReference = (a: SshReference, b: SshReference) =>
  a.id === b.id && a.revision === b.revision;

@Injectable('SshRuntime')
@DependsOn(['DbService', 'KeepAliveCoordinator'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class SshRuntime extends BaseService implements SshModule {
  private readonly profiles: SshProfileService;
  private readonly lifetime = new AbortController();
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private readonly active = new Set<ActiveRun>();
  private readonly probes = new Map<
    string,
    { reference: SshReference; fingerprint: string; expiresAt: number }
  >();
  private readonly targets = new Map<string, SshTarget>();
  private readonly grantTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<() => void>();

  constructor(
    database: DbService,
    private readonly keepAlive: KeepAliveSource,
  ) {
    super();
    this.profiles = new SshProfileService(database);
  }

  isAvailable = () => !!getSshNative();
  hasPendingStorageWork = () => this.queued > 0 || this.active.size > 0;
  getTarget = (sessionId: string) => this.targets.get(sessionId) ?? null;
  subscribeTargets = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notifyTargets() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A view cannot undo a revocation. */
      }
    }
  }
  private clearGrantTimer(contextId: string) {
    const timer = this.grantTimers.get(contextId);
    if (timer) clearTimeout(timer);
    this.grantTimers.delete(contextId);
  }
  private scheduleGrantExpiry(contextId: string, target: SshTarget) {
    this.clearGrantTimer(contextId);
    const grant = target.grant;
    if (!grant) return;
    this.grantTimers.set(
      contextId,
      setTimeout(
        () => {
          this.grantTimers.delete(contextId);
          const current = this.targets.get(contextId);
          if (current?.grant?.id !== grant.id) return;
          for (const run of this.active) if (run.sessionId === contextId) run.cancel();
          this.targets.set(contextId, { ...current, grant: null });
          this.notifyTargets();
        },
        Math.max(0, grant.expiresAt - Date.now()),
      ),
    );
  }
  private changed() {
    publishDataApiChanges(['/ssh-profiles']);
  }
  private assertActive() {
    if (this.lifetime.signal.aborted) throw new SshError('cancelled');
    storageMutationGate.assertWritable();
  }
  /** Serialize storage and operation admission, never a running command. */
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    if (this.queued >= 16) return Promise.reject(new SshError('busy'));
    this.queued++;
    const result = this.tail
      .catch(() => {})
      .then(() => {
        this.assertActive();
        return work();
      });
    this.tail = result.finally(() => {
      this.queued--;
    });
    // Keep a rejected queue tail handled even if its caller only observes result.
    void this.tail.catch(() => {});
    return result;
  }
  private invalidate(profileId: string) {
    for (const run of this.active) if (run.profileId === profileId) run.cancel();
    for (const [sessionId, target] of this.targets)
      if (target.profile.id === profileId) {
        this.targets.delete(sessionId);
        this.clearGrantTimer(sessionId);
      }
    for (const [token, probe] of this.probes)
      if (probe.reference.id === profileId) this.probes.delete(token);
    this.notifyTargets();
  }
  private async removeSecret(reference: string) {
    await SecureStore.deleteItemAsync(secretKey(reference), STORAGE_OPTIONS).catch(() => {});
  }

  save = (input: SaveSshProfile): Promise<SshProfile> =>
    this.serialize(async () => {
      const parsed = SaveSshProfileSchema.safeParse(input);
      if (!parsed.success) throw new SshError('invalid-input');
      const { previous, profile, credential } = parsed.data;
      const old = previous ? await this.profiles.getRow(previous) : undefined;
      if (!old && (await this.profiles.list()).length >= 100) throw new SshError('busy');
      if (
        (!old && !credential) ||
        (credential && credential.authMethod !== profile.authMethod) ||
        (old && old.authMethod !== profile.authMethod && !credential)
      )
        throw new SshError('credential');
      const reference = credential ? randomUUID() : old!.credentialReference;
      if (previous) this.invalidate(previous.id);
      let result: SshProfile;
      try {
        if (credential)
          await SecureStore.setItemAsync(
            secretKey(reference),
            JSON.stringify(credential),
            STORAGE_OPTIONS,
          );
        this.assertActive();
        result = await this.profiles.save(
          {
            ...profile,
            revision: randomUUID(),
            credentialReference: reference,
            fingerprint:
              old?.host === profile.host && old.port === profile.port ? old.fingerprint : null,
          },
          previous,
        );
      } catch (error) {
        if (credential) await this.removeSecret(reference);
        throw error instanceof SshError ? error : new SshError('storage');
      }
      if (credential && old) await this.removeSecret(old.credentialReference);
      this.changed();
      return result;
    });

  remove = (reference: SshReference) =>
    this.serialize(async () => {
      const row = await this.profiles.getRow(SshReferenceSchema.parse(reference));
      this.invalidate(row.id);
      await this.profiles.remove(reference);
      await this.removeSecret(row.credentialReference);
      this.changed();
    });

  probe = async (reference: SshReference, signal: AbortSignal): Promise<SshHostProbe> => {
    const { pending } = await this.serialize(async () => {
      signal.throwIfAborted();
      const row = await this.profiles.getRow(SshReferenceSchema.parse(reference));
      return {
        pending: this.start(
          reference.id,
          { host: row.host, port: row.port, timeoutMs: 20000, probe: true },
          signal,
        ),
      };
    });
    const result = await pending;
    if (result.error || result.state !== 'probed') throw new SshError(result.error || 'handshake');
    return this.serialize(async () => {
      signal.throwIfAborted();
      await this.profiles.getRow(reference);
      // Only an observed key can become trusted; probing never authenticates.
      const token = randomUUID();
      for (const [key, probe] of this.probes)
        if (probe.expiresAt < Date.now()) this.probes.delete(key);
      if (this.probes.size >= 16) this.probes.delete(this.probes.keys().next().value!);
      this.probes.set(token, {
        reference,
        fingerprint: result.fingerprint,
        expiresAt: Date.now() + 300000,
      });
      return { token, fingerprint: result.fingerprint };
    });
  };

  trust = (token: string): Promise<SshProfile> =>
    this.serialize(async () => {
      const probe = this.probes.get(token);
      this.probes.delete(token);
      if (!probe || probe.expiresAt < Date.now()) throw new SshError('changed');
      const row = await this.profiles.getRow(probe.reference);
      this.invalidate(row.id);
      const { id: _id, ...profile } = toSshProfile(row);
      const result = await this.profiles.save(
        {
          ...profile,
          credentialReference: row.credentialReference,
          revision: randomUUID(),
          fingerprint: probe.fingerprint,
        },
        probe.reference,
      );
      this.changed();
      return result;
    });

  selectTarget = (sessionId: string, reference: SshReference | null) =>
    this.serialize(async () => {
      if (!sessionId || sessionId.length > 200) throw new SshError('invalid-input');
      const row = reference
        ? await this.profiles.getRow(SshReferenceSchema.parse(reference))
        : null;
      if (row && !row.fingerprint) throw new SshError('host-key');
      for (const run of this.active) if (run.sessionId === sessionId) run.cancel();
      this.targets.delete(sessionId);
      this.clearGrantTimer(sessionId);
      if (row) {
        if (this.targets.size >= 64) throw new SshError('busy');
        const target: SshTarget = {
          selectionId: randomUUID(),
          profile: toSshProfile(row),
          grant: null,
        };
        this.targets.set(sessionId, target);
        this.scheduleGrantExpiry(sessionId, target);
      }
      this.notifyTargets();
    });

  setCommandGrant = (sessionId: string, expected: SshTarget, allowCommands: boolean) =>
    this.serialize(async () => {
      this.assertAgentTarget(sessionId, expected);
      await this.profiles.getRow(expected.profile);
      this.assertActive();
      this.assertAgentTarget(sessionId, expected);
      for (const run of this.active) if (run.sessionId === sessionId) run.cancel();
      const target: SshTarget = {
        ...expected,
        selectionId: randomUUID(),
        grant: allowCommands ? { id: randomUUID(), expiresAt: Date.now() + 3600000 } : null,
      };
      this.targets.set(sessionId, target);
      this.scheduleGrantExpiry(sessionId, target);
      this.notifyTargets();
    });

  attachDraftTarget = (draftId: string, sessionId: string) =>
    this.serialize(async () => {
      if (!z.uuid().safeParse(draftId).success || !z.uuid().safeParse(sessionId).success)
        throw new SshError('invalid-input');
      const target = this.targets.get(`draft:${draftId}`);
      if (!target) return;
      await this.profiles.getRow(target.profile);
      if (this.targets.size >= 64) throw new SshError('busy');
      const attached: SshTarget = {
        ...target,
        grant: target.grant && target.grant.expiresAt > Date.now() ? target.grant : null,
      };
      this.targets.set(sessionId, attached);
      this.scheduleGrantExpiry(sessionId, attached);
      this.notifyTargets();
    });

  /** Captured by a single turn; target switches and grant expiry are checked at execution too. */
  resolveAgentTarget(sessionId: string): Promise<SshTarget | null> {
    return this.serialize(async () => {
      let target = this.targets.get(sessionId);
      if (!target) return null;
      try {
        await this.profiles.getRow(target.profile);
      } catch {
        this.invalidate(target.profile.id);
        return null;
      }
      if (target.grant && target.grant.expiresAt <= Date.now()) {
        target = { ...target, grant: null };
        this.targets.set(sessionId, target);
        this.clearGrantTimer(sessionId);
        this.notifyTargets();
      }
      return target;
    });
  }

  executeForAgent(sessionId: string, target: SshTarget, command: string, signal: AbortSignal) {
    return this.runCommand(target.profile, command, signal, undefined, { sessionId, target });
  }
  execute = (
    reference: SshReference,
    command: string,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
  ) => this.runCommand(reference, command, signal, onOutput);

  private assertAgentTarget(sessionId: string, target: SshTarget) {
    const current = this.targets.get(sessionId);
    if (
      !current ||
      current.selectionId !== target.selectionId ||
      !sameReference(current.profile, target.profile) ||
      current.grant?.id !== target.grant?.id ||
      (current.grant && current.grant.expiresAt <= Date.now())
    )
      throw new SshError('changed');
  }

  private async runCommand(
    reference: SshReference,
    command: string,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
    agent?: { sessionId: string; target: SshTarget },
  ): Promise<SshCommandResult> {
    const { pending } = await this.serialize(async () => {
      signal.throwIfAborted();
      const parsed = SshCommandSchema.safeParse(command);
      if (!parsed.success) throw new SshError('invalid-input');
      const row = await this.profiles.getRow(SshReferenceSchema.parse(reference));
      if (!row.fingerprint) throw new SshError('host-key');
      if (agent) this.assertAgentTarget(agent.sessionId, agent.target);
      // Same-target serialization prevents concurrent AI/manual changes interleaving.
      if ([...this.active].some((run) => run.profileId === row.id)) throw new SshError('busy');
      let credential: SshCredential;
      try {
        const saved = await SecureStore.getItemAsync(
          secretKey(row.credentialReference),
          STORAGE_OPTIONS,
        );
        credential = SshCredentialSchema.parse(JSON.parse(saved ?? 'null'));
      } catch {
        throw new SshError('credential');
      }
      if (credential.authMethod !== row.authMethod) throw new SshError('credential');
      this.assertActive();
      signal.throwIfAborted();
      if (agent) this.assertAgentTarget(agent.sessionId, agent.target);
      return {
        pending: this.start(
          row.id,
          {
            host: row.host,
            port: row.port,
            username: row.username,
            fingerprint: row.fingerprint,
            ...(credential.authMethod === 'password'
              ? { password: credential.password }
              : { privateKey: credential.privateKey, passphrase: credential.passphrase ?? '' }),
            command: parsed.data,
            timeoutMs: 60000,
            probe: false,
          },
          signal,
          onOutput,
          agent?.sessionId,
        ),
      };
    });
    const result = await pending;
    return {
      state: result.state === 'probed' ? 'not-started' : result.state,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  private start(
    profileId: string,
    options: SshNativeOptions,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
    sessionId?: string,
  ): Promise<NativeResult> {
    this.assertActive();
    signal.throwIfAborted();
    const native = getSshNative();
    if (!native) throw new SshError('unavailable');
    const id = randomUUID();
    if (!native.prepare(id)) throw new SshError('busy');
    const cancel = () => {
      try {
        native.cancel(id);
      } catch {
        // The native deadline still bounds a run if its bridge is gone.
      }
    };
    let lease: KeepAliveLease | undefined;
    let listener: { remove(): void } | undefined;
    const active: ActiveRun = { profileId, sessionId, cancel, settled: Promise.resolve() };
    const cleanup = () => {
      signal.removeEventListener('abort', cancel);
      this.active.delete(active);
      try {
        listener?.remove();
      } catch {
        // A detached bridge must not replace a confirmed command result.
      }
      try {
        lease?.release();
      } catch {
        // Keep remaining local cleanup independent of the platform lease.
      }
    };
    const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    const partial = { stdout: '', stderr: '' };
    try {
      signal.addEventListener('abort', cancel, { once: true });
      lease = this.keepAlive.acquire('ssh.command', cancel);
      listener = native.addListener('onOutput', (event) => {
        if (
          event.runId !== id ||
          !Object.hasOwn(decoders, event.stream) ||
          event.base64.length > 350000
        )
          return;
        try {
          const text = decoders[event.stream]
            .decode(toByteArray(event.base64), { stream: true })
            .slice(0, Math.max(0, 256 * 1024 - partial.stdout.length - partial.stderr.length));
          partial[event.stream] += text;
          onOutput?.({ stream: event.stream, text });
        } catch {
          /* Output observers never interrupt a remote operation. */
        }
      });
    } catch {
      cancel();
      cleanup();
      throw new SshError('unavailable');
    }
    this.active.add(active);
    const pending = Promise.resolve()
      .then(() => native.run(id, options))
      .then((value) => {
        const result = NativeResultSchema.parse(JSON.parse(value));
        return {
          ...result,
          stdout: new TextDecoder().decode(toByteArray(result.stdout)),
          stderr: new TextDecoder().decode(toByteArray(result.stderr)),
        };
      })
      .catch((): NativeResult => {
        cancel();
        return {
          // A bridge failure cannot prove whether exec reached the remote host.
          state: options.probe ? 'not-started' : 'unknown',
          error: 'connection',
          stdout: partial.stdout,
          stderr: partial.stderr,
          exitCode: null,
          truncated: false,
          fingerprint: '',
        };
      })
      .finally(cleanup);
    active.settled = pending;
    return pending;
  }

  protected async onStop() {
    this.lifetime.abort();
    this.targets.clear();
    this.probes.clear();
    this.notifyTargets();
    this.listeners.clear();
    for (const run of this.active) run.cancel();
    await this.tail.catch(() => {});
    await Promise.allSettled([...this.active].map((run) => run.settled));
    for (const timer of this.grantTimers.values()) clearTimeout(timer);
    this.grantTimers.clear();
    this.targets.clear();
    this.probes.clear();
  }
  protected onDestroy() {
    return this.onStop();
  }
}
