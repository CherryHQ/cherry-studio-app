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

  /** One sync attempt. Concurrent callers share it; failures reject but change nothing. */
  sync(): Promise<void> {
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
    if (!getActiveProfile().identity) return;
    this.registerAppStateListener((status) => {
      if (status === 'active' && Date.now() - this.lastAttempt >= FOREGROUND_MIN_GAP_MS)
        this.syncInBackground();
    });
    const state = await this.readState();
    this.schedule(state?.syncIntervalMinutes ?? 10);
    this.syncInBackground();
  }

  private syncInBackground(): void {
    void this.sync().catch((error: unknown) => {
      logger.warn('Enterprise sync failed; keeping the current configuration', error as Error);
    });
  }

  private schedule(minutes: number): void {
    if (minutes === this.intervalMinutes) return;
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
    });
    const skipped: SkipLog = [];
    const configuration = parseConfiguration(await api.getConfiguration(), skipped);
    if (configuration.serverUniqueId !== identity.deployment)
      throw new Error('The enterprise address now points to a different server');
    const agents = await this.loadAgents(api, configuration, skipped);
    const previous = await this.readState();
    const hash = sha256HexOfText(JSON.stringify({ configuration, agents }));
    this.schedule(configuration.syncIntervalMinutes);
    const pendingSkill = agents.some((setup) =>
      setup.skills.some((skill) => previous?.skills[skill.remoteId] !== skill.updatedAt),
    );
    if (previous?.hash === hash && !pendingSkill) return;

    const skills = await this.publishSkills(api, agents, previous?.skills ?? {}, skipped);
    if (skipped.length) logger.info('Skipped enterprise items Mobile cannot use', { skipped });
    const { changedServers, changedPaths } = await this.db.withWriteTx(async (tx) => {
      const result = await projectConfiguration(tx, {
        configuration,
        agents,
        publishedSkills: skills.published,
        skillRemoteIds: new Set(Object.keys(skills.revisions)),
      });
      const state: SyncState = {
        hash,
        syncIntervalMinutes: configuration.syncIntervalMinutes,
        skills: skills.revisions,
      };
      await tx
        .insert(appStateTable)
        .values({ key: ENTERPRISE_SYNC_STATE_KEY, value: state })
        .onConflictDoUpdate({ target: appStateTable.key, set: { value: state } });
      return result;
    });
    await this.preference.setMultiple(configuration.defaults);
    for (const id of changedServers) this.mcp.invalidateServer(id);
    publishDataApiChanges(changedPaths);
  }

  private async loadAgents(
    api: EnterpriseApi,
    configuration: EnterpriseConfiguration,
    skipped: SkipLog,
  ): Promise<AgentSetup[]> {
    const setups: AgentSetup[] = [];
    const queue = [...configuration.agentIds];
    // Relation changes do not update an Agent's timestamp, so every Agent's setup is read.
    await Promise.all(
      Array.from({ length: Math.min(SETUP_CONCURRENCY, queue.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          const setup = parseAgentSetup(await api.setupAgent(id), configuration, skipped);
          if (setup) setups.push(setup);
        }
      }),
    );
    return setups.sort((a, b) => a.agent.remoteId.localeCompare(b.agent.remoteId));
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
    const revisions: Record<string, string> = {};
    for (const skill of delivered.values()) {
      if (previous[skill.remoteId] === skill.updatedAt && installed.has(skill.remoteId)) {
        revisions[skill.remoteId] = skill.updatedAt;
        continue;
      }
      try {
        // react-doctor-disable-next-line async-await-in-loop -- bound memory to one package at a time
        const download = await api.downloadLibraryItem(skill.itemId, SKILL_ARCHIVE_MAX_BYTES);
        // react-doctor-disable-next-line async-await-in-loop -- sequential with its download
        const files = await readEnterpriseSkill(download.data, download.contentType);
        const validation = validateSkillPackage(files);
        if (!validation.ok)
          throw new Error(validation.issues.map((issue) => issue.code).join(', '));
        const pkg = validation.package;
        if (rows.some((row) => row.folderName === pkg.name && row.remoteId !== skill.remoteId))
          throw new Error(`a different Skill named ${pkg.name} is installed`);
        // react-doctor-disable-next-line async-await-in-loop -- staging owns one package at a time
        const handle = await skillStorage.stage(files);
        // react-doctor-disable-next-line async-await-in-loop -- immutable revision before its row commits
        await skillStorage.publish(handle, { folderName: pkg.name, contentHash: pkg.contentHash });
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
        skipped.push(`skill ${skill.remoteId}: ${(error as Error).message}`);
        // Keep the installed revision; the next sync retries the download.
        if (installed.has(skill.remoteId) && previous[skill.remoteId])
          revisions[skill.remoteId] = previous[skill.remoteId]!;
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
