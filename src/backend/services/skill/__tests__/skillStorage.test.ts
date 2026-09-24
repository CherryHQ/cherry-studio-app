import { createSkillStorage, type SkillFileSystem } from '../skillStorage';

jest.mock('expo-file-system', () => ({
  Directory: jest.fn(),
  File: jest.fn(),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('../../../../../modules/managed-storage', () => ({ getManagedStorage: () => null }));

type Node = { kind: 'dir'; children: Map<string, Node> } | { kind: 'file'; bytes: Uint8Array };

/** In-memory tree with the same semantics the Expo adapter relies on. */
function createFakeFileSystem() {
  const root: Node = { kind: 'dir', children: new Map() };
  const key = (path: readonly string[]) =>
    path.flatMap((segment) => segment.split('/').filter(Boolean));
  const find = (path: readonly string[]): Node | null => {
    let node: Node = root;
    for (const segment of key(path)) {
      if (node.kind !== 'dir') return null;
      const next = node.children.get(segment);
      if (!next) return null;
      node = next;
    }
    return node;
  };
  const parentOf = (path: readonly string[]) => {
    const segments = key(path);
    const parent = find(segments.slice(0, -1));
    if (!parent || parent.kind !== 'dir') {
      throw new Error(`Missing parent for ${segments.join('/')}`);
    }
    return { parent, name: segments[segments.length - 1]! };
  };
  const fs: SkillFileSystem = {
    exists: (path) => find(path) !== null,
    isDirectory: (path) => find(path)?.kind === 'dir',
    list: (path) => {
      const node = find(path);
      return node?.kind === 'dir' ? [...node.children.keys()] : [];
    },
    readBytes: async (path) => {
      const node = find(path);
      if (node?.kind !== 'file') throw new Error('not a file');
      return node.bytes;
    },
    writeBytes: (path, bytes) => {
      const { parent, name } = parentOf(path);
      parent.children.set(name, { kind: 'file', bytes });
    },
    createDirectory: (path) => {
      let node: Node = root;
      for (const segment of key(path)) {
        if (node.kind !== 'dir') throw new Error('file in the way');
        let next = node.children.get(segment);
        if (!next) {
          next = { kind: 'dir', children: new Map() };
          node.children.set(segment, next);
        }
        node = next;
      }
    },
    move: async (from, to) => {
      const node = find(from);
      if (!node) throw new Error('missing source');
      if (find(to)) throw new Error('destination exists');
      const target = parentOf(to);
      const source = parentOf(from);
      source.parent.children.delete(source.name);
      target.parent.children.set(target.name, node);
    },
    remove: (path) => {
      const { parent, name } = parentOf(path);
      parent.children.delete(name);
    },
  };
  return { fs, snapshot: () => walk(root, []) };
}

function walk(node: Node, prefix: string[]): string[] {
  if (node.kind === 'file') return [prefix.join('/')];
  return [...node.children].flatMap(([name, child]) => walk(child, [...prefix, name])).sort();
}

const encoder = new TextEncoder();
const files = new Map([
  ['SKILL.md', encoder.encode('---\nname: brief\ndescription: d\n---\nbody')],
  ['references/format.md', encoder.encode('# Format')],
]);

describe('createSkillStorage', () => {
  it('stages under cache, publishes into the persistent root, and reads only package paths', async () => {
    const { fs, snapshot } = createFakeFileSystem();
    fs.createDirectory(['app-support']);
    fs.createDirectory(['cache']);
    const storage = createSkillStorage(fs, {
      persistent: () => ['app-support'],
      cache: () => ['cache'],
    });
    const handle = await storage.stage(files);
    expect(snapshot().every((path) => path.startsWith('cache/SkillStaging/'))).toBe(true);

    const ref = { folderName: 'brief', packageDigest: 'abc' };
    expect(storage.hasRevision(ref)).toBe(false);
    await storage.publish(handle, ref);
    expect(snapshot()).toEqual([
      'app-support/Data/Skills/brief/revisions/abc/SKILL.md',
      'app-support/Data/Skills/brief/revisions/abc/references/format.md',
    ]);
    expect(storage.hasRevision(ref)).toBe(true);
    expect(storage.listFiles(ref)).toEqual(['SKILL.md', 'references/format.md']);
    expect(new TextDecoder().decode((await storage.readFile(ref, 'references/format.md'))!)).toBe(
      '# Format',
    );
    expect(await storage.readFile(ref, '../../other/SKILL.md')).toBeNull();
    expect(await storage.readFile(ref, 'references')).toBeNull();
    await expect(storage.publish(handle, ref)).rejects.toMatchObject({
      code: 'candidate-expired',
    });
  });

  it('keeps accepted revisions through reconciliation and removes orphans and staging', async () => {
    const { fs, snapshot } = createFakeFileSystem();
    fs.createDirectory(['app-support']);
    fs.createDirectory(['cache']);
    const storage = createSkillStorage(fs, {
      persistent: () => ['app-support'],
      cache: () => ['cache'],
    });
    await storage.publish(await storage.stage(files), { folderName: 'brief', packageDigest: 'v1' });
    await storage.publish(await storage.stage(files), { folderName: 'brief', packageDigest: 'v2' });
    await storage.publish(await storage.stage(files), {
      folderName: 'orphan',
      packageDigest: 'v1',
    });
    await storage.stage(files); // an interrupted install leaves staging behind

    storage.reconcile([{ folderName: 'brief', packageDigest: 'v2' }]);
    expect(snapshot()).toEqual([
      'app-support/Data/Skills/brief/revisions/v2/SKILL.md',
      'app-support/Data/Skills/brief/revisions/v2/references/format.md',
    ]);
    storage.removeSkill('brief');
    expect(snapshot()).toEqual([]);
  });

  it('fails closed without the native root instead of using another directory', async () => {
    const { fs } = createFakeFileSystem();
    fs.createDirectory(['cache']);
    const storage = createSkillStorage(fs, { persistent: () => null, cache: () => ['cache'] });
    expect(storage.isAvailable()).toBe(false);
    const handle = await storage.stage(files);
    await expect(
      storage.publish(handle, { folderName: 'brief', packageDigest: 'v1' }),
    ).rejects.toMatchObject({ code: 'storage-unavailable' });
    expect(() => storage.reconcile([])).not.toThrow();
  });
});
