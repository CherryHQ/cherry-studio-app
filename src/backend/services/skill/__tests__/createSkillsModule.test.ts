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
    isEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const skills = {
    findByFolderName: async (folderName: string) =>
      [...rows.values()].find((s) => s.folderName === folderName) ?? null,
    getById: async (id: string) => {
      const row = rows.get(id);
      if (!row) throw new Error('not found');
      return row;
    },
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
    createTx: async (_tx: unknown, record: SkillInstallRecord, agentIds: readonly string[]) => {
      const id = `00000000-0000-4000-8000-00000000000${nextId++}`;
      const skill = toSkill(record, id, record.name);
      rows.set(id, skill);
      fakes.bound.push(...agentIds.map((agentId) => `${agentId}:${id}`));
      return skill;
    },
    updateRevisionTx: async (_tx: unknown, id: string, record: SkillInstallRecord) => {
      const skill = toSkill(record, id, rows.get(id)!.folderName);
      rows.set(id, skill);
      return skill;
    },
    deleteTx: async (_tx: unknown, id: string) => {
      rows.delete(id);
    },
    listStorageReferences: async () =>
      [...rows.values()].map((s) => ({ folderName: s.folderName, contentHash: s.contentHash })),
  } as unknown as AgentGlobalSkillService;
  const storage: SkillStorage = {
    stage: async () => {
      const handle = `stage-${staged.size + 1}`;
      staged.add(handle);
      return handle;
    },
    discardStaging: (handle) => void staged.delete(handle),
    publish: async (handle, ref) => {
      if (!staged.delete(handle)) throw new Error('missing staging');
      published.push(`${ref.folderName}/${ref.contentHash}`);
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

const marketplace = { resolveUrl: async () => [], search: async () => [] };

function createModule(fakes: Fakes, definitions: BundledSkillDefinition[]) {
  const candidates = (): SkillSourceCandidate[] =>
    createBundledSkillSource(definitions)
      .list()
      .map((candidate) => ({
        ...candidate,
        candidateId: `github:${candidate.name}@${candidate.version}`,
        source: {
          ...candidate.source,
          registry: 'github',
          locator: `github:owner/repo/${candidate.name}`,
          url: `https://github.com/owner/repo/blob/main/${candidate.name}/SKILL.md`,
        },
      }));
  return createSkillsModule({
    marketplace: { ...marketplace, resolveUrl: async () => candidates() },
    db: fakes.db,
    skills: fakes.skills,
    storage: fakes.storage,
    environment: { read: async () => environment },
    sources: {
      bundled: createBundledSkillSource([]),
      github: {
        registry: 'github',
        resolve: async () => {
          throw new Error('unused');
        },
        acquire: (candidate, signal) =>
          createBundledSkillSource(definitions).acquire(
            { ...candidate, source: { ...candidate.source, locator: `bundled:${candidate.name}` } },
            signal,
          ),
        resolveUrl: async (url) => {
          const candidate = candidates().find((item) => item.source.url === url);
          if (!candidate) throw new Error('not found');
          return candidate;
        },
      },
    },
    agentFacts: async () => ({ disabledCapabilities: [], supportsToolCalling: true }),
  });
}

describe('createSkillsModule', () => {
  it('refuses to expose system workflows as installable candidates', async () => {
    const fakes = createFakes();
    const bundled = createBundledSkillSource();
    const module = createSkillsModule({
      marketplace: { ...marketplace, resolveUrl: async () => bundled.list() },
      db: fakes.db,
      skills: fakes.skills,
      storage: fakes.storage,
      environment: { read: async () => environment },
      sources: {
        bundled,
        github: {
          ...bundled,
          registry: 'github',
          resolveUrl: async () => {
            throw new Error('unused');
          },
        },
      },
      agentFacts: async () => ({ disabledCapabilities: [], supportsToolCalling: true }),
    });
    await expect(module.resolve('https://github.com/owner/repo')).rejects.toMatchObject({
      code: 'source-invalid',
    });
    await expect(module.inspect(bundled.list()[0]!.candidateId)).rejects.toMatchObject({
      code: 'candidate-expired',
    });
    expect(fakes.rows.size).toBe(0);
  });

  it('reads the complete instruction body from the supplied immutable revision without an interpreter', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [needsPython]);
    const [candidate] = await module.resolve('https://github.com/owner/repo');
    const installed = await module.install({ candidateId: candidate!.candidateId });
    fakes.storage.readFile = async (ref, path) =>
      ref.contentHash === installed.contentHash && path === 'SKILL.md'
        ? new TextEncoder().encode(needsPython.files['SKILL.md']!)
        : null;
    expect(await module.instructionReader.read({ ...installed, isEnabled: false })).toBe(
      'Run python.',
    );
    expect(
      await module.instructionReader.read({ ...installed, contentHash: 'missing-revision' }),
    ).toBeNull();
  });
  it('reuses the same accepted package for a new Agent without republishing it', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed]);
    const [first] = await module.resolve('https://github.com/owner/repo');
    const installed = await module.install({
      candidateId: first!.candidateId,
      agentIds: ['first'],
    });
    const [again] = await module.resolve('https://github.com/owner/repo');
    const reused = await module.install({ candidateId: again!.candidateId, agentIds: ['second'] });
    expect(reused.id).toBe(installed.id);
    expect(fakes.rows.size).toBe(1);
    expect(fakes.published).toHaveLength(1);
    expect(fakes.bound).toEqual([`first:${installed.id}`, `second:${installed.id}`]);
  });

  it('inspects, binds explicitly, and installs packages despite environment limitations', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed, needsWeb, needsPython]);
    const changes = jest.fn();
    module.subscribeChanges(changes);
    const [notes, web, py] = await module.resolve('https://github.com/owner/repo');
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
    expect(await module.inspect(py!.candidateId)).toMatchObject({
      admission: { status: 'unsupported' },
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
    expect(fakes.published).toEqual([`notes/${installed.contentHash}`]);
    expect(fakes.bound).toEqual([`agent-1:${installed.id}`]);
    expect(changes).toHaveBeenCalledTimes(1);
    await expect(module.install({ candidateId: notes!.candidateId })).rejects.toMatchObject({
      code: 'candidate-expired',
    });
    const [again] = await module.resolve('https://github.com/owner/repo');
    expect(again!.installedSkillId).toBe(installed.id);
    await expect(module.install({ candidateId: again!.candidateId })).rejects.toMatchObject({
      code: 'already-installed',
    });
    expect(await module.inspect(web!.candidateId)).toMatchObject({
      candidate: { installedSkillId: null },
    });
    await expect(module.install({ candidateId: py!.candidateId })).resolves.toMatchObject({
      name: 'py-notes',
    });
    await expect(
      module.install({ candidateId: web!.candidateId, agentIds: ['agent-1'] }),
    ).resolves.toMatchObject({ name: 'web-notes' });
    expect(fakes.rows.size).toBe(3);
  });

  it('keeps the installation when a record commit fails and cleans staging', async () => {
    const fakes = createFakes();
    const module = createModule(fakes, [reviewed]);
    fakes.db.withWriteTx = async () => {
      throw new Error('commit failed');
    };
    const [notes] = await module.resolve('https://github.com/owner/repo');
    await expect(module.install({ candidateId: notes!.candidateId })).rejects.toThrow(
      'commit failed',
    );
    expect(fakes.rows.size).toBe(0);
    expect(fakes.staged.size).toBe(0);
  });

  it('updates despite execution limitations, preserves the last valid package, and uninstalls', async () => {
    const fakes = createFakes();
    const definitions: BundledSkillDefinition[] = [reviewed];
    const module = createModule(fakes, definitions);
    const [notes] = await module.resolve('https://github.com/owner/repo');
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
      skill: { id: installed.id, source: 'marketplace' },
    });
    expect(updated.skill.contentHash).not.toBe(installed.contentHash);
    expect(fakes.published).toHaveLength(2);

    definitions[0] = {
      ...needsPython,
      name: 'notes',
      revision: 3,
      files: { 'SKILL.md': '---\nname: notes\ndescription: Take notes\n---\nRun python.' },
    };
    const pythonUpdate = await module.update(installed.id);
    expect(pythonUpdate.outcome).toBe('updated');
    expect(fakes.published).toHaveLength(3);

    definitions[0] = {
      ...reviewed,
      revision: 4,
      files: { 'SKILL.md': '---\nname: notes\n---\nMissing description.' },
    };
    expect(await module.update(installed.id)).toMatchObject({
      outcome: 'rejected',
      skill: { contentHash: pythonUpdate.skill.contentHash },
    });
    expect(fakes.published).toHaveLength(3);

    await module.uninstall(installed.id);
    expect(fakes.rows.size).toBe(0);
    expect(fakes.published).toHaveLength(3); // Active turns retain immutable revisions.
    await module.reconcileStorage();
    expect(fakes.storage.reconcile).toHaveBeenCalledWith([]);
  });

  it('installs and updates complete external packages without inferring execution support', async () => {
    const fakes = createFakes();
    let files: Record<string, string> = {
      'SKILL.md':
        '---\nname: notes\ndescription: Take notes\ncompatibility: Requires Python\n---\nRead references/outline.md, then run scripts/fill.py.',
      'scripts/fill.py': 'print(1)',
      'references/outline.md': 'Use headings.',
    };
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
    const module = createSkillsModule({
      marketplace: { ...marketplace, resolveUrl: async () => [candidate] },
      db: fakes.db,
      skills: fakes.skills,
      storage: fakes.storage,
      environment: { read: async () => environment },
      sources: {
        bundled: createBundledSkillSource([]),
        github: {
          registry: 'github',
          acquire: async () => ({
            expectedName: 'notes',
            files: new Map(
              Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]),
            ),
          }),
          resolve: async () => candidate,
          resolveUrl: async () => candidate,
        },
      },
      agentFacts: async () => ({ disabledCapabilities: ['web'], supportsToolCalling: false }),
    });
    const [resolved] = await module.resolve(candidate.source.url!);
    expect(await module.inspect(resolved!.candidateId)).toMatchObject({
      profile: {
        provenance: 'unverified',
        requirements: { execution: 'none', builtInTools: [], pluginTools: [] },
      },
      admission: { status: 'unverified', reasons: [] },
    });
    const installed = await module.install({
      candidateId: resolved!.candidateId,
      agentIds: ['agent-1'],
    });
    expect(installed.manifest.map(({ path }) => path)).toEqual([
      'SKILL.md',
      'references/outline.md',
      'scripts/fill.py',
    ]);
    expect(fakes.bound).toEqual([`agent-1:${installed.id}`]);
    expect((await module.update(installed.id)).outcome).toBe('unchanged');
    files = {
      'SKILL.md': '---\nname: notes\ndescription: Take notes\n---\nRun `python scripts/fill.py`.',
      'scripts/fill.py': 'print(1)',
    };
    expect(await module.update(installed.id)).toMatchObject({
      outcome: 'updated',
      skill: {
        profile: { provenance: 'unverified' },
        manifest: [{ path: 'SKILL.md' }, { path: 'scripts/fill.py' }],
      },
    });
    expect((await fakes.skills.getById(installed.id)).contentHash).not.toBe(installed.contentHash);
  });
});
