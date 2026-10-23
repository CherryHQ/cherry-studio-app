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
import type { DbService } from '@/backend/data/db/DbService';
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

import { isAuthenticationRejection } from '../account/AccountRuntime';
import { createEnterpriseApi, type EnterpriseApi } from '../enterpriseApi';
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
  /** Server revision of each delivered Skill package. */
  skills: z.record(z.string(), z.string()),
});
type SyncState = z.infer<typeof StateSchema>;

const FOREGROUND_MIN_GAP_MS = 5 * 60_000;
const SETUP_CONCURRENCY = 4;

/** The installation account, as the sync needs it. */
export interface EnterpriseSession {
  getProductToken(): Promise<string>;
  refreshProductToken?(rejectedToken: string): Promise<string | null>;
  /** The server refused the session; the user must sign in again. */
  reportRejected(): void;
}

/**
 * Keeps the enterprise profile's managed configuration current. It runs only in an enterprise
 * profile, never blocks the app after the first successful sync, and on failure keeps what is
 * already in the database and only logs.
 */
@Injectable('EnterpriseSyncService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
@DependsOn(['DbService', 'PreferenceService', 'McpRuntimeService'])
export class EnterpriseSyncService extends BaseService {
  private session: EnterpriseSession | undefined;
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

  configure(session: EnterpriseSession): void {
    this.session = session;
  }

  /** Whether this profile has ever completed a sync; the app waits for the first one. */
  async hasSynced(): Promise<boolean> {
    return (await this.readState()) !== null;
  }

  hasPendingStorageWork(): boolean {
    return this.running !== undefined;
  }

  /** One admitted attempt includes network reads, Skill publication and the resource commit. */
  sync(): Promise<void> {
    try {
      this.assertWritable();
    } catch (error) {
      return Promise.reject(error);
    }
    this.running ??= this.run()
      .catch((error: unknown) => {
        if (isAuthenticationRejection(error)) this.session?.reportRejected();
        throw error;
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  protected override async onAllReady(): Promise<void> {
    if (this.lifetime.signal.aborted || !getActiveProfile().identity) return;
    this.registerAppStateListener((status) => {
      if (status === 'active' && Date.now() - this.lastAttempt >= FOREGROUND_MIN_GAP_MS)
        this.syncInBackground();
    });
    const state = await this.readState();
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

  private async run(): Promise<void> {
    const profile = getActiveProfile();
    const { identity } = profile;
    if (!identity || !this.session) return;
    this.lastAttempt = Date.now();
    const session = this.session;
    const api = createEnterpriseApi({
      baseUrl: profile.address,
      getToken: session.getProductToken,
      refreshToken: session.refreshProductToken,
    });
    this.invalidateServers();
    const skipped: SkipLog = [];
    const configuration = parseConfiguration(
      await api.getConfiguration(this.lifetime.signal),
      skipped,
    );
    this.assertWritable();
    if (configuration.serverUniqueId !== identity.deployment) {
      session.reportRejected();
      throw new Error('The enterprise address now points to a different server');
    }
    const agents = await this.loadAgents(api, configuration, skipped);
    this.assertWritable();
    const previous = await this.readState();
    const hash = sha256HexOfText(JSON.stringify({ configuration, agents }));
    this.schedule(configuration.syncIntervalMinutes);
    const pendingSkill = agents.some((setup) =>
      setup.skills.some((skill) => previous?.skills[skill.remoteId] !== skill.updatedAt),
    );
    this.assertWritable();
    if (previous?.hash === hash && !pendingSkill) return;

    const skills = await this.publishSkills(api, agents, previous?.skills ?? {}, skipped);
    if (skipped.length) logger.info('Skipped enterprise items Mobile cannot use', { skipped });
    this.assertWritable();
    const { changedServers, changedPaths, publishDefaults } = await this.db.withWriteTx(
      async (tx) => {
        this.assertWritable();
        const result = await projectConfiguration(tx, {
          configuration,
          agents,
          publishedSkills: skills.published,
        });
        const publishDefaults = await this.preference.writeEnterpriseDefaults(
          tx,
          configuration.defaults,
        );
        const state: SyncState = {
          hash,
          syncIntervalMinutes: configuration.syncIntervalMinutes,
          skills: skills.revisions,
        };
        await tx
          .insert(appStateTable)
          .values({ key: ENTERPRISE_SYNC_STATE_KEY, value: state })
          .onConflictDoUpdate({ target: appStateTable.key, set: { value: state } });
        this.assertWritable();
        return { ...result, publishDefaults };
      },
    );
    publishDefaults();
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

  private async loadAgents(
    api: EnterpriseApi,
    configuration: EnterpriseConfiguration,
    skipped: SkipLog,
  ): Promise<AgentSetup[]> {
    const setups: AgentSetup[] = [];
    const queue = [...configuration.agentIds];
    // Relation changes do not update an Agent's timestamp, so every Agent's setup is read.
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(SETUP_CONCURRENCY, queue.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          this.assertWritable();
          const setup = parseAgentSetup(
            await api.setupAgent(id, this.lifetime.signal),
            configuration,
            skipped,
          );
          if (setup.remoteId !== String(id))
            throw new Error('Enterprise Agent setup identity mismatch');
          setups.push(setup);
        }
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    return setups.sort((a, b) => a.remoteId.localeCompare(b.remoteId));
  }

  /** Downloads only packages whose server revision changed. A failed package keeps its old row. */
  private async publishSkills(
    api: EnterpriseApi,
    agents: readonly AgentSetup[],
    previous: Record<string, string>,
    skipped: SkipLog,
  ): Promise<{ published: PublishedSkill[]; revisions: Record<string, string> }> {
    const delivered = new Map(
      agents.flatMap((setup) => setup.skills.map((skill) => [skill.remoteId, skill])),
    );
    const rows = await this.db
      .getDb()
      .select({
        remoteId: agentGlobalSkillTable.managedRemoteId,
        folderName: agentGlobalSkillTable.folderName,
      })
      .from(agentGlobalSkillTable);
    const installed = new Set(rows.map((row) => row.remoteId));
    const published: PublishedSkill[] = [];
    const retainedIds = new Set(agents.flatMap((setup) => setup.skillRemoteIds));
    const revisions = Object.fromEntries(
      Object.entries(previous).filter(([id]) => retainedIds.has(id) && installed.has(id)),
    );
    for (const skill of delivered.values()) {
      this.assertWritable();
      if (previous[skill.remoteId] === skill.updatedAt && installed.has(skill.remoteId)) {
        revisions[skill.remoteId] = skill.updatedAt;
        continue;
      }
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
        if (isAuthenticationRejection(error)) throw error;
        skipped.push(`skill ${skill.remoteId}: ${(error as Error).message}`);
        // The previous installed revision remains; the next sync retries this package.
      } finally {
        if (handle) skillStorage.discardStaging(handle);
      }
    }
    return { published, revisions };
  }

  private async readState(): Promise<SyncState | null> {
    const [row] = await this.db
      .getDb()
      .select({ value: appStateTable.value })
      .from(appStateTable)
      .where(eq(appStateTable.key, ENTERPRISE_SYNC_STATE_KEY));
    return StateSchema.safeParse(row?.value).data ?? null;
  }
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
