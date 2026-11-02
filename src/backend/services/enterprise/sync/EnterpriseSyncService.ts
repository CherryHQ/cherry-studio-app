import { loggerService } from '@logger';
import { eq } from 'drizzle-orm';
import * as z from 'zod';

import { BaseService } from '@/backend/core/lifecycle/BaseService';
import {
  AppStatePolicy,
  DependsOn,
  Injectable,
  ServicePhase,
} from '@/backend/core/lifecycle/decorators';
import { Phase } from '@/backend/core/lifecycle/types';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  agentGlobalSkillTable,
  appStateTable,
  ENTERPRISE_SYNC_STATE_KEY,
} from '@/backend/data/db/schemas';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import {
  deriveSkillProfile,
  readSkillArchive,
  SKILL_ARCHIVE_MAX_BYTES,
  type SkillPackageFiles,
  skillStorage,
  validateSkillPackage,
} from '@/backend/services/skill';
import { getActiveProfile } from '@/shared/data/activeProfile';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { createEnterpriseApi, type EnterpriseApi, type EnterpriseSession } from '../enterpriseApi';
import {
  type AgentSetup,
  type EnterpriseConfiguration,
  parseAgentSetup,
  parseConfiguration,
  type SkipLog,
} from './enterpriseConfiguration';
import { projectConfiguration, type PublishedSkill } from './projectConfiguration';

const logger = loggerService.withContext('EnterpriseSync');

const StateSchema = z.object({
  hash: z.string(),
  syncIntervalMinutes: z.number().int().positive(),
  /** Server revision of each installed delivered Skill package. */
  skills: z.record(z.string(), z.string()),
});
type SyncState = z.infer<typeof StateSchema>;

/** One accepted server snapshot. Agents whose setup could not be read stay as installed. */
type Snapshot = Readonly<{
  configuration: EnterpriseConfiguration;
  agents: AgentSetup[];
  unreadAgentIds: string[];
}>;

const FOREGROUND_MIN_GAP_MS = 5 * 60_000;
const SETUP_CONCURRENCY = 4;

/**
 * Keeps the enterprise profile's managed configuration current. It runs only in an enterprise
 * profile, never blocks the app after the first successful sync, and on failure keeps what is
 * already in the database and only logs. Session refusals are the enterprise API's concern.
 */
@Injectable('EnterpriseSyncService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
@DependsOn(['DbService', 'PreferenceService', 'McpRuntimeService'])
export class EnterpriseSyncService extends BaseService {
  private session: Required<EnterpriseSession> | undefined;
  private running: Promise<void> | undefined;
  private readonly lifetime = new AbortController();
  private readonly pendingInvalidations = new Set<string>();
  private lastAttempt = 0;
  private intervalMinutes = 0;
  private stopTimer: { dispose(): void } | undefined;

  constructor(
    private readonly db: DbService,
    private readonly preference: PreferenceService,
    private readonly mcp: { invalidateServer(serverId: string): void },
  ) {
    super();
  }

  configure(session: Required<EnterpriseSession>): void {
    this.session = session;
  }

  /** Whether this profile has ever completed a sync; the app waits for the first one. */
  async hasSynced(): Promise<boolean> {
    return (await this.readState(this.db.getDb())) !== null;
  }

  hasPendingStorageWork(): boolean {
    return this.running !== undefined;
  }

  /** One admitted attempt: the organization's resources, then changed Skill packages. */
  sync(): Promise<void> {
    return this.admit(true);
  }

  /**
   * The first launch waits for resources only. Skill packages follow in the background attempt,
   * which starts after startup has reconciled Skill storage.
   */
  syncResources(): Promise<void> {
    return this.admit(false);
  }

  protected override async onAllReady(): Promise<void> {
    if (this.lifetime.signal.aborted || !getActiveProfile().identity) return;
    this.registerAppStateListener((status) => {
      if (status === 'active' && Date.now() - this.lastAttempt >= FOREGROUND_MIN_GAP_MS)
        this.syncInBackground();
    });
    const state = await this.readState(this.db.getDb());
    if (this.lifetime.signal.aborted) return;
    this.schedule(state?.syncIntervalMinutes ?? 10);
    this.syncInBackground();
  }

  /** Also used by bootstrap before PostReady initialization, when the first sync can run. */
  async stop(): Promise<void> {
    this.lifetime.abort();
    this.stopTimer?.dispose();
    await this.running?.catch(() => {});
  }

  protected override onStop(): Promise<void> {
    return this.stop();
  }

  private admit(installSkills: boolean): Promise<void> {
    try {
      this.assertWritable();
    } catch (error) {
      return Promise.reject(error);
    }
    this.running ??= this.run(installSkills).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private assertWritable(): void {
    this.lifetime.signal.throwIfAborted();
    storageMutationGate.assertWritable();
  }

  private syncInBackground(): void {
    void this.sync().catch((error: unknown) => {
      logger.warn('Enterprise sync failed; keeping the current configuration', error as Error);
    });
  }

  private schedule(minutes: number): void {
    if (this.lifetime.signal.aborted || minutes === this.intervalMinutes) return;
    this.stopTimer?.dispose();
    this.intervalMinutes = minutes;
    this.stopTimer = this.registerInterval(() => this.syncInBackground(), minutes * 60_000);
  }

  private async run(installSkills: boolean): Promise<void> {
    const profile = getActiveProfile();
    const { identity } = profile;
    if (!identity || !this.session) return;
    this.lastAttempt = Date.now();
    const session = this.session;
    const api = createEnterpriseApi({ baseUrl: profile.address, session });
    this.invalidateServers();
    const skipped: SkipLog = [];
    try {
      const configuration = parseConfiguration(
        await api.getConfiguration(this.lifetime.signal),
        skipped,
      );
      this.assertWritable();
      if (configuration.serverUniqueId !== identity.deployment) {
        session.reportRejected();
        throw new Error('The enterprise address now points to a different server');
      }
      this.schedule(configuration.syncIntervalMinutes);
      const snapshot: Snapshot = {
        configuration,
        ...(await this.loadAgents(api, configuration, skipped)),
      };
      this.assertWritable();
      const hash = sha256HexOfText(JSON.stringify(snapshot));
      if ((await this.readState(this.db.getDb()))?.hash !== hash)
        await this.commitResources(snapshot, hash);
      if (installSkills) await this.installSkills(api, snapshot, skipped);
    } finally {
      if (skipped.length) logger.info('Skipped enterprise items Mobile cannot use', { skipped });
    }
  }

  /** Resources, default models and the applied sync state commit together. */
  private async commitResources(snapshot: Snapshot, hash: string): Promise<void> {
    const { changedServers, changedPaths, publishDefaults } = await this.db.withWriteTx(
      async (tx) => {
        this.assertWritable();
        const result = await projectConfiguration(tx, { ...snapshot, publishedSkills: [] });
        const publishDefaults = await this.preference.writeEnterpriseDefaults(
          tx,
          snapshot.configuration.defaults,
        );
        const previous = await this.readState(tx);
        await this.writeState(tx, {
          hash,
          syncIntervalMinutes: snapshot.configuration.syncIntervalMinutes,
          skills: installedRevisions(previous?.skills ?? {}, result.skillRemoteIds),
        });
        this.assertWritable();
        return { ...result, publishDefaults };
      },
    );
    publishDefaults();
    this.publishChanges(changedServers, changedPaths);
  }

  private publishChanges(changedServers: readonly string[], changedPaths: string[]): void {
    for (const id of changedServers) this.pendingInvalidations.add(id);
    this.invalidateServers();
    publishDataApiChanges(changedPaths);
  }

  private invalidateServers(): void {
    for (const id of this.pendingInvalidations) {
      try {
        this.mcp.invalidateServer(id);
        this.pendingInvalidations.delete(id);
      } catch (error) {
        // Retain failed invalidations even if the next response has the same committed hash.
        logger.warn('Could not invalidate an updated enterprise MCP server', error as Error);
      }
    }
  }

  /** One Agent's failed setup leaves that Agent as installed; the rest of the snapshot applies. */
  private async loadAgents(
    api: EnterpriseApi,
    configuration: EnterpriseConfiguration,
    skipped: SkipLog,
  ): Promise<Omit<Snapshot, 'configuration'>> {
    const agents: AgentSetup[] = [];
    const unreadAgentIds: string[] = [];
    const queue = [...configuration.agentIds];
    // Relation changes do not update an Agent's timestamp, so every Agent's setup is read.
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(SETUP_CONCURRENCY, queue.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          this.assertWritable();
          try {
            const setup = parseAgentSetup(
              await api.setupAgent(id, this.lifetime.signal),
              configuration,
              skipped,
            );
            if (setup.remoteId !== String(id))
              throw new Error('Enterprise Agent setup identity mismatch');
            agents.push(setup);
          } catch (error) {
            // Stopping or freezing storage ends the attempt instead of skipping this Agent.
            this.assertWritable();
            skipped.push(`agent ${id}: ${(error as Error).message}`);
            unreadAgentIds.push(String(id));
          }
        }
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    return {
      agents: agents.sort((a, b) => a.remoteId.localeCompare(b.remoteId)),
      unreadAgentIds: unreadAgentIds.sort(),
    };
  }

  /**
   * Downloads packages whose server revision changed, then binds them in a second commit. A failed
   * package keeps its installed revision and is retried by a later attempt.
   */
  private async installSkills(
    api: EnterpriseApi,
    snapshot: Snapshot,
    skipped: SkipLog,
  ): Promise<void> {
    const state = await this.readState(this.db.getDb());
    if (!state) return;
    const rows = await this.db
      .getDb()
      .select({
        remoteId: agentGlobalSkillTable.managedRemoteId,
        folderName: agentGlobalSkillTable.folderName,
      })
      .from(agentGlobalSkillTable);
    const installed = new Set(rows.map((row) => row.remoteId));
    const delivered = new Map(
      snapshot.agents.flatMap((setup) => setup.skills.map((skill) => [skill.remoteId, skill])),
    );
    const published: PublishedSkill[] = [];
    const revisions: Record<string, string> = {};
    for (const skill of delivered.values()) {
      this.assertWritable();
      if (state.skills[skill.remoteId] === skill.updatedAt && installed.has(skill.remoteId))
        continue;
      let handle: string | undefined;
      try {
        // react-doctor-disable-next-line async-await-in-loop -- bound memory to one package at a time
        const download = await api.downloadLibraryItem(
          skill.itemId,
          SKILL_ARCHIVE_MAX_BYTES,
          this.lifetime.signal,
        );
        // react-doctor-disable-next-line async-await-in-loop -- sequential with its download
        const files = await readEnterpriseSkill(download.data, download.contentType);
        this.assertWritable();
        const validation = validateSkillPackage(files);
        if (!validation.ok)
          throw new Error(validation.issues.map((issue) => issue.code).join(', '));
        const pkg = validation.package;
        if (rows.some((row) => row.folderName === pkg.name && row.remoteId !== skill.remoteId))
          throw new Error(`a different Skill named ${pkg.name} is installed`);
        // react-doctor-disable-next-line async-await-in-loop -- staging owns one package at a time
        handle = await skillStorage.stage(files);
        this.assertWritable();
        // react-doctor-disable-next-line async-await-in-loop -- immutable revision before its row commits
        await skillStorage.publish(handle, { folderName: pkg.name, contentHash: pkg.contentHash });
        this.assertWritable();
        published.push({
          remoteId: skill.remoteId,
          name: pkg.name,
          description: pkg.description,
          folderName: pkg.name,
          source: 'marketplace',
          sourceUrl: null,
          author: pkg.author,
          version: pkg.version,
          tags: pkg.tags,
          contentHash: pkg.contentHash,
          manifest: pkg.manifest,
          profile: deriveSkillProfile(pkg),
          invocation: pkg.invocation,
        });
        revisions[skill.remoteId] = skill.updatedAt;
      } catch (error) {
        this.assertWritable();
        // Any download failure, including a role that may not read the package, skips it only.
        skipped.push(`skill ${skill.remoteId}: ${(error as Error).message}`);
      } finally {
        if (handle) skillStorage.discardStaging(handle);
      }
    }
    if (!published.length) return;
    const { changedServers, changedPaths } = await this.db.withWriteTx(async (tx) => {
      this.assertWritable();
      const result = await projectConfiguration(tx, { ...snapshot, publishedSkills: published });
      const current = await this.readState(tx);
      if (current)
        await this.writeState(tx, {
          ...current,
          skills: installedRevisions({ ...current.skills, ...revisions }, result.skillRemoteIds),
        });
      this.assertWritable();
      return result;
    });
    this.publishChanges(changedServers, changedPaths);
  }

  private async readState(db: Database): Promise<SyncState | null> {
    const [row] = await db
      .select({ value: appStateTable.value })
      .from(appStateTable)
      .where(eq(appStateTable.key, ENTERPRISE_SYNC_STATE_KEY));
    return StateSchema.safeParse(row?.value).data ?? null;
  }

  private async writeState(tx: Database, state: SyncState): Promise<void> {
    await tx
      .insert(appStateTable)
      .values({ key: ENTERPRISE_SYNC_STATE_KEY, value: state })
      .onConflictDoUpdate({ target: appStateTable.key, set: { value: state } });
  }
}

/** Revisions of the managed Skills still installed after a commit. */
function installedRevisions(
  revisions: Record<string, string>,
  installed: readonly string[],
): Record<string, string> {
  const ids = new Set(installed);
  return Object.fromEntries(Object.entries(revisions).filter(([id]) => ids.has(id)));
}

/** Library downloads are a bare `SKILL.md` or a ZIP holding one package directory. */
async function readEnterpriseSkill(
  data: ArrayBuffer,
  contentType?: string,
): Promise<SkillPackageFiles> {
  const bytes = new Uint8Array(data);
  if (contentType?.split(';')[0]?.trim() === 'text/markdown') return new Map([['SKILL.md', bytes]]);
  const files = await readSkillArchive(bytes);
  if (files.has('SKILL.md')) return files;
  const roots = new Set([...files.keys()].map((path) => path.split('/')[0]));
  const prefix = roots.size === 1 ? `${[...roots][0]}/` : '';
  if (!prefix || !files.has(`${prefix}SKILL.md`)) throw new Error('package-invalid');
  return new Map([...files].map(([path, value]) => [path.slice(prefix.length), value]));
}
