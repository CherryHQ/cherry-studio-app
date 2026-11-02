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
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { SshHostProbe, SshModule } from '@/shared/contracts/ssh';
import {
  SaveSshProfileSchema,
  SshCommandInputSchema,
  SshFileRequestSchema,
  SshFilePathSchema,
  SshCredentialSchema,
  SshError,
  SshErrorCodeSchema,
  SshReferenceSchema,
  type SaveSshProfile,
  type SshCommandResult,
  type SshCommandInput,
  type SshFileRequest,
  type SshFileResult,
  type SshAuthenticationRequest,
  type SshTransferProgress,
  type SshCredential,
  type SshOutput,
  type SshProfile,
  type SshReference,
  type SshTarget,
} from '@/shared/data/types/ssh';

import { getSshNative, type SshNativeOptions } from '../../../../modules/ssh';
import { createSshStagingFile, importSshDownload, stageSshUpload } from './sshFileStorage';

const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const secretKey = (id: string) => `ssh-secret.${id}`;
const NativeResultSchema = z.object({
  state: z.enum(['not-started', 'exited', 'unknown', 'probed', 'completed']),
  stdout: z.string().max(350000),
  stderr: z.string().max(350000),
  exitCode: z.number().int().nullable(),
  truncated: z.boolean(),
  fingerprint: z.string().max(100),
  error: z.union([z.literal(''), SshErrorCodeSchema]),
  path: z.string().max(6000).optional(),
  entries: z
    .array(
      z.object({
        name: z.string().max(6000),
        type: z.enum(['directory', 'file', 'symlink', 'other']),
        size: z.number().nonnegative().nullable(),
        modifiedAt: z.number().nonnegative().nullable(),
      }),
    )
    .max(500)
    .optional(),
  content: z.string().max(350000).optional(),
  bytes: z.number().int().nonnegative().optional(),
  diagnostics: z
    .object({
      phase: z.enum(['connect', 'handshake', 'authentication', 'command', 'sftp', 'transfer']),
      code: z.number().int(),
      hostKeyType: z.number().int(),
      keyExchange: z.string().max(256),
      cipher: z.string().max(256),
      authenticationMethods: z.string().max(512),
      reused: z.boolean(),
    })
    .optional(),
});
type NativeResult = z.infer<typeof NativeResultSchema>;
type ActiveRun = {
  profileId: string;
  sessionId?: string;
  cancel(): void;
  settled: Promise<unknown>;
};
type AgentAccess = { sessionId: string; target: SshTarget };
const decode = (value: string) => new TextDecoder().decode(toByteArray(value));
const poolKey = (reference: SshReference) => `${reference.id}:${reference.revision}`;
const AuthenticationEventSchema = z.object({
  challenge: z.string().min(1).max(20),
  name: z.string().max(1400),
  instruction: z.string().max(5500),
  waitMs: z.number().int().min(1).max(120000),
  prompts: z
    .array(z.object({ text: z.string().max(1400), echo: z.boolean() }))
    .min(1)
    .max(8),
});
const sameReference = (a: SshReference, b: SshReference) =>
  a.id === b.id && a.revision === b.revision;

@Injectable('SshRuntime')
@DependsOn(['DbService', 'KeepAliveCoordinator'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('continue')
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
  private readonly transfers = new Set<ActiveRun>();
  private authenticationRequests: readonly SshAuthenticationRequest[] = [];
  private readonly authenticationListeners = new Set<() => void>();
  private readonly authenticationResponders = new Map<
    string,
    (responses: readonly string[] | null) => void
  >();
  private maintenance: ReturnType<typeof setTimeout> | undefined;
  private maintenancePending: Promise<unknown> | undefined;

  constructor(
    database: DbService,
    private readonly keepAlive: KeepAliveSource,
  ) {
    super();
    this.profiles = new SshProfileService(database);
  }

  isAvailable = () => !!getSshNative();
  hasPendingStorageWork = () => this.queued > 0 || this.active.size > 0 || this.transfers.size > 0;
  getAuthenticationRequests = () => this.authenticationRequests;
  subscribeAuthentication = (listener: () => void) => {
    this.authenticationListeners.add(listener);
    return () => {
      this.authenticationListeners.delete(listener);
    };
  };
  respondAuthentication = (id: string, responses: readonly string[] | null) => {
    const request = this.authenticationRequests.find((item) => item.id === id);
    if (!request) return;
    if (
      responses &&
      (responses.length !== request.prompts.length ||
        responses.some(
          (value) => value.includes('\0') || new TextEncoder().encode(value).length > 4096,
        ))
    )
      throw new SshError('invalid-input');
    this.authenticationResponders.get(id)?.(responses);
    this.removeAuthentication(id);
  };
  private notifyAuthentication() {
    for (const listener of this.authenticationListeners) {
      try {
        listener();
      } catch {
        /* Observers do not own authentication. */
      }
    }
  }
  private removeAuthentication(id: string) {
    this.authenticationResponders.delete(id);
    const remaining = this.authenticationRequests.filter((item) => item.id !== id);
    if (remaining.length === this.authenticationRequests.length) return;
    this.authenticationRequests = remaining;
    this.notifyAuthentication();
  }
  private scheduleMaintenance() {
    if (this.maintenance || this.maintenancePending || this.lifetime.signal.aborted) return;
    this.maintenance = setTimeout(() => {
      this.maintenance = undefined;
      const native = getSshNative();
      if (!native || this.lifetime.signal.aborted) return;
      this.maintenancePending = native
        .maintain()
        .then((count) => {
          this.maintenancePending = undefined;
          if (count > 0) this.scheduleMaintenance();
        })
        .catch(() => {
          this.maintenancePending = undefined;
        });
    }, 15000);
  }
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
          for (const run of [...this.active, ...this.transfers])
            if (run.sessionId === contextId) run.cancel();
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
    for (const run of this.transfers) if (run.profileId === profileId) run.cancel();
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
      if (previous) {
        this.invalidate(previous.id);
        getSshNative()?.closePool(poolKey(previous));
      }
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
      getSshNative()?.closePool(poolKey(reference));
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
      getSshNative()?.closePool(poolKey(probe.reference));
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
      for (const run of [...this.active, ...this.transfers])
        if (run.sessionId === sessionId) run.cancel();
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
      for (const run of [...this.active, ...this.transfers])
        if (run.sessionId === sessionId) run.cancel();
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

  executeForAgent(
    sessionId: string,
    target: SshTarget,
    input: SshCommandInput,
    signal: AbortSignal,
  ) {
    return this.runCommand(target.profile, input, signal, undefined, { sessionId, target });
  }
  execute = (
    reference: SshReference,
    input: SshCommandInput,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
  ) => this.runCommand(reference, input, signal, onOutput);

  files = (reference: SshReference, input: SshFileRequest, signal: AbortSignal) =>
    this.runFiles(reference, input, signal);

  filesForAgent(sessionId: string, target: SshTarget, input: SshFileRequest, signal: AbortSignal) {
    return this.runFiles(target.profile, input, signal, { sessionId, target });
  }

  private async runFiles(
    reference: SshReference,
    input: SshFileRequest,
    signal: AbortSignal,
    agent?: AgentAccess,
  ): Promise<SshFileResult> {
    const parsed = SshFileRequestSchema.safeParse(input);
    if (!parsed.success) throw new SshError('invalid-input');
    return this.fileResult(
      await this.runOperation(reference, parsed.data, signal, undefined, agent),
    );
  }

  private fileResult(result: NativeResult): SshFileResult {
    return {
      state:
        result.state === 'completed'
          ? 'completed'
          : result.state === 'unknown'
            ? 'unknown'
            : 'not-started',
      path: result.path ?? '',
      entries: result.entries ?? [],
      content: result.content ?? '',
      bytes: result.bytes ?? 0,
      truncated: result.truncated,
      ...(result.error ? { error: result.error } : {}),
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    };
  }

  download = (
    reference: SshReference,
    path: string,
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
  ) => this.downloadFile(reference, path, signal, onProgress);

  downloadForAgent(
    sessionId: string,
    target: SshTarget,
    path: string,
    folderId: string | null,
    signal: AbortSignal,
  ) {
    return this.downloadFile(
      target.profile,
      path,
      signal,
      undefined,
      { sessionId, target },
      folderId,
    );
  }

  private downloadFile(
    reference: SshReference,
    path: string,
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
    agent?: AgentAccess,
    folderId: string | null = null,
  ): Promise<ResolvedFile> {
    return this.trackTransfer(
      reference,
      signal,
      async (transferSignal) => {
        const parsed = SshFilePathSchema.safeParse(path);
        if (!parsed.success) throw new SshError('invalid-input');
        const stage = createSshStagingFile();
        try {
          const result = await this.runOperation(
            reference,
            { operation: 'download', path: parsed.data, localPath: stage.path },
            transferSignal,
            undefined,
            agent,
            onProgress,
          );
          if (result.state !== 'completed' || result.error)
            throw new SshError(result.error || 'sftp');
          // Admission remains counted through managed publication. A changed profile or
          // revoked conversation cannot publish a download that finished late.
          return await this.serialize(async () => {
            await this.profiles.getRow(reference);
            this.assertActive();
            transferSignal.throwIfAborted();
            if (agent) this.assertAgentTarget(agent.sessionId, agent.target);
            return importSshDownload(
              stage.file.uri,
              result.path || parsed.data,
              folderId,
              transferSignal,
            );
          });
        } finally {
          stage.dispose();
        }
      },
      agent?.sessionId,
    );
  }

  upload = (
    reference: SshReference,
    input: { path: string; fileEntryId: string; overwrite: boolean },
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
  ) => this.uploadFile(reference, input, signal, onProgress);

  uploadForAgent(
    sessionId: string,
    target: SshTarget,
    input: { path: string; fileEntryId: string; overwrite: boolean },
    signal: AbortSignal,
  ) {
    return this.uploadFile(target.profile, input, signal, undefined, { sessionId, target });
  }

  private uploadFile(
    reference: SshReference,
    input: { path: string; fileEntryId: string; overwrite: boolean },
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
    agent?: AgentAccess,
  ): Promise<SshFileResult> {
    return this.trackTransfer(
      reference,
      signal,
      async (transferSignal) => {
        const parsed = z
          .strictObject({ path: SshFilePathSchema, fileEntryId: z.uuid(), overwrite: z.boolean() })
          .safeParse(input);
        if (!parsed.success) throw new SshError('invalid-input');
        const stage = createSshStagingFile();
        try {
          await stageSshUpload(parsed.data.fileEntryId, stage.file, transferSignal);
          return this.fileResult(
            await this.runOperation(
              reference,
              {
                operation: 'upload',
                path: parsed.data.path,
                overwrite: parsed.data.overwrite,
                localPath: stage.path,
              },
              transferSignal,
              undefined,
              agent,
              onProgress,
            ),
          );
        } finally {
          stage.dispose();
        }
      },
      agent?.sessionId,
    );
  }

  private trackTransfer<T>(
    reference: SshReference,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
    sessionId?: string,
  ): Promise<T> {
    this.assertActive();
    if (this.transfers.size >= 4) return Promise.reject(new SshError('busy'));
    const controller = new AbortController();
    const linked = linkAbortSignals([signal, this.lifetime.signal, controller.signal]);
    const transfer: ActiveRun = {
      profileId: reference.id,
      sessionId,
      cancel: () => controller.abort(),
      settled: Promise.resolve(),
    };
    this.transfers.add(transfer);
    const pending = Promise.resolve()
      .then(() => {
        linked.signal.throwIfAborted();
        return work(linked.signal);
      })
      .finally(() => {
        this.transfers.delete(transfer);
        linked.dispose();
      });
    transfer.settled = pending;
    return pending;
  }

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
    input: SshCommandInput,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
    agent?: AgentAccess,
  ): Promise<SshCommandResult> {
    const parsed = SshCommandInputSchema.safeParse(input);
    if (!parsed.success) throw new SshError('invalid-input');
    const result = await this.runOperation(
      reference,
      { ...parsed.data, operation: 'exec' },
      signal,
      onOutput,
      agent,
    );
    return {
      state:
        result.state === 'exited'
          ? 'exited'
          : result.state === 'unknown'
            ? 'unknown'
            : 'not-started',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }

  private async runOperation(
    reference: SshReference,
    operation: Partial<
      Pick<
        SshNativeOptions,
        'operation' | 'command' | 'cwd' | 'stdin' | 'path' | 'localPath' | 'content' | 'overwrite'
      >
    >,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
    agent?: AgentAccess,
    onProgress?: (progress: SshTransferProgress) => void,
  ): Promise<NativeResult> {
    const { pending } = await this.serialize(async () => {
      signal.throwIfAborted();
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
            ...operation,
            directory: row.remoteDirectory,
            poolKey: poolKey(reference),
            timeoutMs: 60000,
            probe: false,
          },
          signal,
          onOutput,
          agent?.sessionId,
          onProgress,
        ),
      };
    });
    return pending;
  }

  private start(
    profileId: string,
    options: SshNativeOptions,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
    sessionId?: string,
    onProgress?: (progress: SshTransferProgress) => void,
  ): Promise<NativeResult> {
    this.assertActive();
    signal.throwIfAborted();
    const native = getSshNative();
    if (!native) throw new SshError('unavailable');
    const id = randomUUID();
    if (!native.prepare(id)) throw new SshError('busy');
    let authenticationId: string | undefined;
    const cancel = () => {
      if (authenticationId) this.removeAuthentication(authenticationId);
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
      if (authenticationId) this.removeAuthentication(authenticationId);
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
      if (!options.probe) this.scheduleMaintenance();
    };
    const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    const partial = { stdout: '', stderr: '' };
    try {
      signal.addEventListener('abort', cancel, { once: true });
      lease = this.keepAlive.acquire('ssh.command', cancel);
      listener = native.addListener('onEvent', (event) => {
        if (
          event.runId !== id ||
          event.base64.length > 350000 ||
          signal.aborted ||
          this.lifetime.signal.aborted
        )
          return;
        try {
          if (event.stream === 'authentication') {
            const challenge = AuthenticationEventSchema.parse(JSON.parse(decode(event.base64)));
            if (authenticationId) this.removeAuthentication(authenticationId);
            authenticationId = `${id}:${challenge.challenge}`;
            const request: SshAuthenticationRequest = {
              id: authenticationId,
              destination: `${options.username}@${options.host}:${options.port}`,
              name: decode(challenge.name),
              instruction: decode(challenge.instruction),
              prompts: challenge.prompts.map((prompt) => ({
                text: decode(prompt.text),
                echo: prompt.echo,
              })),
              expiresAt: Date.now() + challenge.waitMs,
            };
            this.authenticationResponders.set(request.id, (responses) => {
              if (!responses || request.expiresAt <= Date.now()) cancel();
              else {
                try {
                  native.respond(id, challenge.challenge, responses);
                } catch {
                  cancel();
                }
              }
            });
            this.authenticationRequests = [...this.authenticationRequests, request];
            this.notifyAuthentication();
            return;
          }
          if (event.stream === 'progress') {
            const progress = z
              .object({
                transferred: z.number().int().nonnegative(),
                total: z.number().int().nonnegative().nullable(),
              })
              .parse(JSON.parse(decode(event.base64)));
            onProgress?.(progress);
            return;
          }
          if (event.stream !== 'stdout' && event.stream !== 'stderr') return;
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
        let content: string | undefined;
        if (result.content !== undefined) {
          try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(toByteArray(result.content));
            if (content.includes('\0')) throw new SshError('binary-file');
          } catch {
            content = '';
            if (!result.error) result.error = 'binary-file';
          }
        }
        return {
          ...result,
          stdout: decode(result.stdout),
          stderr: decode(result.stderr),
          path: result.path === undefined ? undefined : decode(result.path),
          content,
          entries: result.entries?.map((entry) => ({ ...entry, name: decode(entry.name) })),
          diagnostics: result.diagnostics
            ? {
                ...result.diagnostics,
                keyExchange: decode(result.diagnostics.keyExchange),
                cipher: decode(result.diagnostics.cipher),
                authenticationMethods: decode(result.diagnostics.authenticationMethods),
              }
            : undefined,
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
    for (const run of this.transfers) run.cancel();
    if (this.maintenance) clearTimeout(this.maintenance);
    this.maintenance = undefined;
    getSshNative()?.closeAll();
    await this.tail.catch(() => {});
    await Promise.allSettled([...this.active].map((run) => run.settled));
    await Promise.allSettled([...this.transfers].map((run) => run.settled));
    await this.maintenancePending;
    this.authenticationRequests = [];
    this.authenticationResponders.clear();
    this.notifyAuthentication();
    this.authenticationListeners.clear();
    for (const timer of this.grantTimers.values()) clearTimeout(timer);
    this.grantTimers.clear();
    this.targets.clear();
    this.probes.clear();
  }
  protected onDestroy() {
    return this.onStop();
  }
}
