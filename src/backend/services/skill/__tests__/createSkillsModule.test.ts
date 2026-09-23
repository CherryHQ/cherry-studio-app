import type {
  AgentGlobalSkillService,
  SkillInstallRecord,
} from '@/backend/data/services/AgentGlobalSkillService';
import type { Skill } from '@/shared/data/types/skill';

import type { BundledSkillDefinition } from '../bundled';
import { createSkillsModule } from '../createSkillsModule';
import type { SkillEnvironmentFacts } from '../skillAdmission';
import { createBundledSkillSource, type SkillSourceCandidate } from '../skillSources';
import type { SkillStorage } from '../skillStorage';

jest.mock('@/backend/services/http', () => ({
  createHttpClient: jest.fn(),
  isHttpError: () => false,
}));

const environment: SkillEnvironmentFacts = {
  platform: 'ios',
  permissions: {},
  webSearchAvailability: { fetchUrls: false, searchKeywords: false },
  hasPaintingModel: false,
  connectedPlugins: new Map(),
};

const reviewed: BundledSkillDefinition = {
  name: 'notes',
  revision: 1,
  requirements: { platforms: null, execution: 'none', builtInTools: [], pluginTools: [] },
  workflowScope: 'Notes',
  files: {
    'SKILL.md': '---\nname: notes\ndescription: Take notes\n---\nWrite notes.',
    'references/t.md': '# T',
  },
};
const needsWeb: BundledSkillDefinition = {
  ...reviewed,
  name: 'web-notes',
  requirements: {
    platforms: null,
    execution: 'none',
    builtInTools: ['web_search'],
    pluginTools: [],
  },
  files: { 'SKILL.md': '---\nname: web-notes\ndescription: Web notes\n---\nSearch first.' },
};
const needsPython: BundledSkillDefinition = {
  ...reviewed,
  name: 'py-notes',
  requirements: { platforms: null, execution: 'python', builtInTools: [], pluginTools: [] },
  files: { 'SKILL.md': '---\nname: py-notes\ndescription: Py notes\n---\nRun python.' },
};

type Fakes = ReturnType<typeof createFakes>;
function createFakes() {
  const rows = new Map<string, Skill>();
  const published: string[] = [];
  const staged = new Set<string>();
  let nextId = 1;
  const toSkill = (record: SkillInstallRecord, id: string, folderName: string): Skill => ({
    ...record,
    id,
    folderName,
    isGlobalEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const skills = {
    findByLocator: async (locator: string) =>
      [...rows.values()].find((s) => s.source.locator === locator) ?? null,
    getById: async (id: string) => {
      const row = rows.get(id);
      if (!row) throw new Error('not found');
      return row;
    },
    allocateFolderNameTx: async (_tx: unknown, name: string) => name,
    applyBindingUpdatesTx: async (
      _tx: unknown,
      agentId: string,
      updates: { skillId: string; isEnabled: boolean }[],
    ) => {
      fakes.bound.push(
        ...updates
          .filter((update) => update.isEnabled)
          .map((update) => `${agentId}:${update.skillId}`),
      );
    },
    createTx: async (
      _tx: unknown,
      record: SkillInstallRecord,
      folderName: string,
      agentIds: readonly string[],
    ) => {
      const id = `00000000-0000-4000-8000-00000000000${nextId++}`;
      const skill = toSkill(record, id, folderName);
      rows.set(id, skill);
      fakes.bound.push(...agentIds.map((agentId) => `${agentId}:${id}`));
      return skill;
    },
    updateRevisionTx: async (_tx: unknown, id: string, record: SkillInstallRecord) => {
      const skill = toSkill(record, id, rows.get(id)!.folderName);
      rows.set(id, skill);
      return skill;
    },
    tombstoneTx: async (_tx: unknown, id: string) => {
      const skill = rows.get(id)!;
      rows.delete(id);
      return skill;
    },
    listStorageReferences: async () =>
      [...rows.values()].map((s) => ({ folderName: s.folderName, packageDigest: s.packageDigest })),
  } as unknown as AgentGlobalSkillService;
  const storage: SkillStorage = {
    isAvailable: () => true,
    stage: async () => {
      const handle = `stage-${staged.size + 1}`;
      staged.add(handle);
      return handle;
    },
    discardStaging: (handle) => void staged.delete(handle),
    publish: async (handle, ref) => {
      if (!staged.delete(handle)) throw new Error('missing staging');
      published.push(`${ref.folderName}/${ref.packageDigest}`);
    },
    hasRevision: () => true,
    readFile: async () => null,
    listFiles: () => [],
    removeSkill: (folderName) =>
      void published.splice(
        0,
        published.length,
        ...published.filter((p) => !p.startsWith(`${folderName}/`)),
      ),
    reconcile: jest.fn(),
  };
  const fakes = {
    rows,
    published,
    staged,
    bound: [] as string[],
    skills,
    storage,
    db: {
      withWriteTx: async <T>(fn: (tx: never) => Promise<T>) => fn(undefined as never),
    },
  };
  return fakes;
}

function createModule(fakes: Fakes, definitions: BundledSkillDefinition[]) {
  return createSkillsModule({
    db: fakes.db,
    skills: fakes.skills,
    storage: fakes.storage,
    environment: { read: async () => environment, pluginToolCatalog: () => new Map() },
    sources: {
      bundled: {
        registry: 'bundled',
        list: () => createBundledSkillSource(definitions).list(),
        resolve: (locator, signal) =>
          createBundledSkillSource(definitions).resolve(locator, signal),
        acquire: (candidate, signal) =>
          createBundledSkillSource(definitions).acquire(candidate, signal),
      },
      github: {
        registry: 'github',
        resolve: async () => {
          throw new Error('unused');
        },
        acquire: async () => {
          throw new Error('unused');
        },
        resolveUrl: async () => {
          throw new Error('unused');
        },
      },
    },
    agentFacts: async () => ({ disabledCapabilities: [], supportsToolCalling: true }),
  });
}

describe('createSkillsModule', () => {
  it('refuses changed preparation fingerprints before publishing or binding', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed]);
    const [candidate] = await module.listRecommended();
    for (const expected of [
      { expectedPackageDigest: 'stale-package' },
      { expectedProfileDigest: 'stale-profile' },
    ]) {
      await expect(
        module.install({
          candidateId: candidate!.candidateId,
          agentIds: ['agent'],
          ...expected,
        }),
      ).rejects.toMatchObject({ code: 'admission-unverified' });
    }
    expect(fakes.rows.size).toBe(0);
    expect(fakes.staged.size).toBe(0);
    expect(fakes.published).toEqual([]);
    expect(fakes.bound).toEqual([]);
  });

  it('reuses the same accepted package for a new Agent without republishing it', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed]);
    const [first] = await module.listRecommended();
    const installed = await module.install({
      candidateId: first!.candidateId,
      agentIds: ['first'],
    });
    const [again] = await module.listRecommended();
    const reused = await module.install({ candidateId: again!.candidateId, agentIds: ['second'] });
    expect(reused.id).toBe(installed.id);
    expect(fakes.rows.size).toBe(1);
    expect(fakes.published).toHaveLength(1);
    expect(fakes.bound).toEqual([`first:${installed.id}`, `second:${installed.id}`]);
  });

  it('inspects, installs once, binds explicitly, and refuses unsupported packages', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed, needsWeb, needsPython]);
    const changes = jest.fn();
    module.subscribeChanges(changes);
    const [notes, web, py] = await module.listRecommended();
    expect(notes).toMatchObject({
      name: 'notes',
      profileProvenance: 'reviewed',
      installedSkillId: null,
    });

    const inspection = await module.inspect(notes!.candidateId);
    expect(inspection).toMatchObject({
      issues: [],
      admission: { status: 'ready', reasons: [] },
      package: { name: 'notes', manifest: [{ path: 'SKILL.md' }, { path: 'references/t.md' }] },
    });
    expect(await module.inspect(web!.candidateId)).toMatchObject({
      admission: { status: 'setup-required' },
    });
    await expect(module.install({ candidateId: py!.candidateId })).rejects.toMatchObject({
      code: 'admission-unsupported',
    });
    await expect(module.install({ candidateId: web!.candidateId })).rejects.toMatchObject({
      code: 'admission-setup-required',
    });
    expect(fakes.staged.size).toBe(0);

    const installed = await module.install({
      candidateId: notes!.candidateId,
      agentIds: ['agent-1'],
    });
    expect(installed).toMatchObject({
      name: 'notes',
      folderName: 'notes',
      profile: { provenance: 'reviewed' },
    });
    expect(fakes.published).toEqual([`notes/${installed.packageDigest}`]);
    expect(fakes.bound).toEqual([`agent-1:${installed.id}`]);
    expect(changes).toHaveBeenCalledTimes(1);
    await expect(module.install({ candidateId: notes!.candidateId })).rejects.toMatchObject({
      code: 'candidate-expired',
    });
    const [again] = await module.listRecommended();
    expect(again!.installedSkillId).toBe(installed.id);
    await expect(module.install({ candidateId: again!.candidateId })).rejects.toMatchObject({
      code: 'already-installed',
    });
    expect(await module.inspect(web!.candidateId)).toMatchObject({
      candidate: { installedSkillId: null },
    });
  });

  it('keeps the installation when a record commit fails and cleans staging', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed]);
    fakes.db.withWriteTx = async () => {
      throw new Error('commit failed');
    };
    const [notes] = await module.listRecommended();
    await expect(module.install({ candidateId: notes!.candidateId })).rejects.toThrow(
      'commit failed',
    );
    expect(fakes.rows.size).toBe(0);
    expect(fakes.staged.size).toBe(0);
  });

  it('updates in place, reports unchanged revisions, rejects unsupported updates, and uninstalls', async () => {
    const fakes = createFakes();
    const definitions: BundledSkillDefinition[] = [reviewed];
    const module = createModule(fakes, definitions);
    const [notes] = await module.listRecommended();
    const installed = await module.install({ candidateId: notes!.candidateId });

    expect(await module.update(installed.id)).toMatchObject({ outcome: 'unchanged' });

    definitions[0] = {
      ...reviewed,
      revision: 2,
      files: { ...reviewed.files, 'references/t.md': '# T2' },
    };
    const updated = await module.update(installed.id);
    expect(updated).toMatchObject({
      outcome: 'updated',
      skill: { id: installed.id, source: { revision: '2' } },
    });
    expect(updated.skill.packageDigest).not.toBe(installed.packageDigest);
    expect(fakes.published).toHaveLength(2);

    definitions[0] = {
      ...needsPython,
      name: 'notes',
      revision: 3,
      files: { 'SKILL.md': '---\nname: notes\ndescription: Take notes\n---\nRun python.' },
    };
    expect(await module.update(installed.id)).toMatchObject({
      outcome: 'rejected',
      skill: { source: { revision: '2' } },
    });
    expect(fakes.published).toHaveLength(2);

    await module.uninstall(installed.id);
    expect(fakes.rows.size).toBe(0);
    expect(fakes.published).toHaveLength(2); // Active turns retain immutable revisions.
    await module.reconcileStorage();
    expect(fakes.storage.reconcile).toHaveBeenCalledWith([]);
  });

  it('keeps unreviewed packages as candidates without an install bypass', async () => {
    const fakes = createFakes();
    const analyzed = createBundledSkillSource([reviewed]);
    const unreviewedCandidate: SkillSourceCandidate = {
      ...analyzed.list()[0]!,
      candidateId: 'x',
      reviewed: null,
    };
    const module = createSkillsModule({
      db: fakes.db,
      skills: fakes.skills,
      storage: fakes.storage,
      environment: { read: async () => environment, pluginToolCatalog: () => new Map() },
      sources: {
        bundled: { ...analyzed, list: () => [unreviewedCandidate] },
        github: {
          registry: 'github',
          resolve: async () => {
            throw new Error('unused');
          },
          acquire: async () => {
            throw new Error('unused');
          },
          resolveUrl: async () => {
            throw new Error('unused');
          },
        },
      },
      agentFacts: async () => null,
    });
    const [candidate] = await module.listRecommended();
    expect(await module.inspect(candidate!.candidateId)).toMatchObject({
      profile: { provenance: 'analyzed' },
      admission: { status: 'unknown', reasons: [{ code: 'unverified' }] },
    });
    await expect(module.install({ candidateId: candidate!.candidateId })).rejects.toMatchObject({
      code: 'admission-unverified',
    });
    expect(fakes.rows.size).toBe(0);
    expect(fakes.published).toEqual([]);
  });
  it('requires explicit AI assessment, persists its exact digest and rejects a changed reference on update', async () => {
    const fakes = createFakes();
    let reference = 'Use headings.';
    const candidate: SkillSourceCandidate = {
      candidateId: 'github:notes',
      name: 'notes',
      description: 'Take notes',
      author: null,
      version: null,
      tags: [],
      reviewed: null,
      source: {
        registry: 'github',
        locator: 'github:owner/repo/notes',
        url: 'https://github.com/owner/repo/blob/main/notes/SKILL.md',
        revision: 'commit',
      },
    };
    const acquire = async () => ({
      expectedName: 'notes',
      files: new Map([
        [
          'SKILL.md',
          new TextEncoder().encode(
            '---\nname: notes\ndescription: Take notes\n---\nUse references/outline.md.',
          ),
        ],
        ['references/outline.md', new TextEncoder().encode(reference)],
      ]),
    });
    const assess = jest.fn(async () => ({
      requirements: {
        platforms: null,
        execution: 'none' as const,
        builtInTools: [],
        pluginTools: [],
      },
      assessment: {
        version: 1 as const,
        modelId: 'provider::model',
        assessedAt: '2026-09-22T00:00:00.000Z',
        decision: 'supported' as const,
        summary: 'Notes',
        uncertainties: [],
        evidence: [
          { path: 'SKILL.md', quote: 'Take notes', explanation: 'Text workflow' },
          { path: 'references/outline.md', quote: 'Use headings.', explanation: 'Outline' },
        ],
      },
    }));
    const module = createSkillsModule({
      db: fakes.db,
      skills: fakes.skills,
      storage: fakes.storage,
      ai: { assess, planSearch: async () => [], rankResults: async () => [] },
      environment: { read: async () => environment, pluginToolCatalog: () => new Map() },
      sources: {
        bundled: createBundledSkillSource([]),
        github: {
          registry: 'github',
          acquire,
          resolve: async () => candidate,
          resolveUrl: async () => candidate,
        },
      },
      agentFacts: async () => null,
    });
    await module.resolveGithub(candidate.source.url!);
    await expect(module.install({ candidateId: candidate.candidateId })).rejects.toMatchObject({
      code: 'admission-unverified',
    });
    expect(assess).not.toHaveBeenCalled();
    expect((await module.assess(candidate.candidateId)).admission?.status).toBe('ready');
    const installed = await module.install({ candidateId: candidate.candidateId });
    expect(installed.profile.provenance).toBe('ai-assessed');
    expect((await module.update(installed.id)).outcome).toBe('unchanged');
    reference = 'Run a different workflow.';
    const result = await module.update(installed.id);
    expect(result).toMatchObject({
      outcome: 'rejected',
      inspection: { admission: { status: 'unknown' } },
    });
    expect((await fakes.skills.getById(installed.id)).packageDigest).toBe(installed.packageDigest);
    expect(assess).toHaveBeenCalledTimes(1);
  });
});
