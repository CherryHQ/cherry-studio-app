import { MemoryError } from '../memoryFiles';
import { memoryFixture } from './_memoryFixture';

test('full-read receipts belong to the caller and conflicting writes never replace newer content', async () => {
  const f = memoryFixture();
  const first = f.open();
  const second = f.open();
  const read = await first.read('MEMORY.md');
  await expect(
    second.commit([{ kind: 'write', receipt: read.receipt, content: 'Foreign write' }]),
  ).rejects.toMatchObject({ code: 'invalid-receipt' });
  f.set('shared/MEMORY.md', 'Edited outside this proposal');
  await expect(
    first.commit([{ kind: 'write', receipt: read.receipt, content: 'Old proposal' }]),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(f.text('shared/MEMORY.md')).toBe('Edited outside this proposal');
  expect(f.files.size).toBe(1);
});

test('shared and Agent private files have separate owners and recovery histories', async () => {
  const f = memoryFixture();
  for (const [scope, content] of [
    [{ kind: 'shared' }, 'Personal preference'],
    [{ kind: 'private', agentId: 'one' }, 'Project A'],
    [{ kind: 'private', agentId: 'two' }, 'Project B'],
  ] as const) {
    const session = f.open(scope);
    const file = await session.read('MEMORY.md');
    await session.commit([{ kind: 'write', receipt: file.receipt, content }]);
  }
  expect(f.text('shared/MEMORY.md')).toBe('Personal preference');
  expect(f.text('agent/one/MEMORY.md')).toBe('Project A');
  expect(f.text('agent/two/MEMORY.md')).toBe('Project B');
  expect([...f.files.keys()].filter((key) => key.startsWith('backups/'))).toHaveLength(3);
});

test('revoked authority and a storage freeze are checked after approval and before publication', async () => {
  const f = memoryFixture();
  let writable = true;
  const session = f.open(undefined, {
    assertWritable: () => {
      if (!writable) throw new MemoryError('conflict', 'Storage frozen');
    },
  });
  const file = await session.read('MEMORY.md');
  await expect(
    session.commit(
      [{ kind: 'write', receipt: file.receipt, content: 'Not approved anymore' }],
      async () => {
        writable = false;
        return () => undefined;
      },
    ),
  ).rejects.toThrow('Storage frozen');
  expect(f.text('shared/MEMORY.md')).toBe('');
  expect([...f.files.keys()].some((key) => key.startsWith('backups/'))).toBe(false);
});

test('a backup admission failure leaves every active file unchanged', async () => {
  const f = memoryFixture();
  const session = f.open();
  const file = await session.read('MEMORY.md');
  f.faults.replace = (root) => {
    if (root.startsWith('backups/')) throw new Error('Backup unavailable');
  };
  await expect(
    session.commit([{ kind: 'write', receipt: file.receipt, content: 'Unsaved' }]),
  ).rejects.toThrow('Backup unavailable');
  expect(f.text('shared/MEMORY.md')).toBe('');
});

test('new files appearing during inference invalidate the scope evidence before a save', async () => {
  const f = memoryFixture();
  const session = f.open();
  const file = await session.read('MEMORY.md');
  f.set('shared/.memories/other.md', 'A newly saved, potentially conflicting fact');
  await expect(
    session.commit([
      { kind: 'write', receipt: file.receipt, content: 'A proposal based on the old file set' },
    ]),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(f.text('shared/MEMORY.md')).toBe('');
});

test('batch reads and commit validation keep storage reads proportional to the scope size', async () => {
  async function storageReads(topicCount: number) {
    const f = memoryFixture();
    const session = f.open();
    const paths = [
      'MEMORY.md',
      ...Array.from({ length: topicCount }, (_, index) => `.memories/topic-${index}.md`),
    ];
    for (const path of paths) f.set('shared/' + path, 'Original ' + path);
    await session.list();
    const read = f.platform.files.read;
    let count = 0;
    f.platform.files.read = async (root, path) => {
      if (root === 'shared') count++;
      return read(root, path);
    };
    const files = await session.readMany(paths, 'extraction');
    const result = await session.commit(
      [{ kind: 'write', receipt: files[0].receipt, content: 'Updated entry' }],
      undefined,
      files.map((file) => file.receipt),
    );
    expect(result.error).toBeUndefined();
    expect(f.text('shared/MEMORY.md')).toBe('Updated entry');
    return count;
  }
  expect(await storageReads(12)).toBeLessThanOrEqual((await storageReads(4)) * 3);
});

test('rereading one target retains the other batch members’ original scope evidence', async () => {
  const f = memoryFixture();
  const session = f.open();
  f.set('shared/.memories/topic.md', 'Original topic');
  await session.readMany(['MEMORY.md', '.memories/topic.md']);
  f.set('shared/.memories/topic.md', 'Newer topic');
  const entry = await session.read('MEMORY.md');
  await expect(
    session.commit([{ kind: 'write', receipt: entry.receipt, content: 'Stale combined proposal' }]),
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(f.text('shared/MEMORY.md')).toBe('');
  expect(f.text('shared/.memories/topic.md')).toBe('Newer topic');
});

test.each(['edit', 'revoke'] as const)(
  'a concurrent %s prevents a batch from returning unconfirmed memory',
  async (change) => {
    const f = memoryFixture();
    let allowed = true;
    const session = f.open(undefined, {
      assertAuthorized: () => {
        if (!allowed) throw new MemoryError('invalid-receipt', 'Access revoked');
        return undefined;
      },
    });
    f.set('shared/.memories/topic.md', 'Original topic');
    await session.list();
    const read = f.platform.files.read;
    let changed = false;
    f.platform.files.read = async (root, path) => {
      const bytes = await read(root, path);
      if (!changed && root === 'shared' && path === '.memories/topic.md') {
        changed = true;
        if (change === 'edit') f.set('shared/.memories/topic.md', 'Newer topic');
        else allowed = false;
      }
      return bytes;
    };
    await expect(session.readMany(['MEMORY.md', '.memories/topic.md'])).rejects.toMatchObject({
      code: change === 'edit' ? 'conflict' : 'invalid-receipt',
    });
  },
);

test('recovery restores confirmed old bytes but preserves files edited after the original operation', async () => {
  const f = memoryFixture();
  const session = f.open();
  f.set('shared/MEMORY.md', 'Original entry');
  f.set('shared/.memories/project.md', 'Original project');
  const entry = await session.read('MEMORY.md');
  const topic = await session.read('.memories/project.md');
  await session.commit([
    { kind: 'write', receipt: entry.receipt, content: 'New entry' },
    { kind: 'write', receipt: topic.receipt, content: 'New project' },
  ]);
  f.set('shared/.memories/project.md', 'A later user edit');
  const preview = await session.previewRecovery();
  expect(preview?.files.find((file) => file.path === '.memories/project.md')?.conflict).toBe(true);
  const result = await session.recover(preview!.token);
  expect(result.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: '.memories/project.md', outcome: 'conflict' }),
    ]),
  );
  expect(f.text('shared/MEMORY.md')).toBe('Original entry');
  expect(f.text('shared/.memories/project.md')).toBe('A later user edit');
});

test('a partial publication reports the confirmed prefix and keeps a usable recovery manifest', async () => {
  const f = memoryFixture();
  const session = f.open();
  const entry = await session.read('MEMORY.md');
  const topic = await session.read('.memories/topic.md');
  f.faults.replace = (root, path) => {
    if (root === 'shared' && path === '.memories/topic.md')
      throw new Error('Interrupted topic publication');
  };
  const result = await session.commit([
    { kind: 'write', receipt: entry.receipt, content: 'Confirmed entry' },
    { kind: 'write', receipt: topic.receipt, content: 'Unconfirmed topic' },
  ]);
  expect(result.error).toContain('Interrupted');
  expect(result.files[0].outcome).toBe('applied');
  expect(f.text('shared/MEMORY.md')).toBe('Confirmed entry');
  expect(f.text('shared/.memories/topic.md')).toBeNull();
  f.faults.replace = undefined;
  const recovery = await session.previewRecovery();
  await session.recover(recovery!.token);
  expect(f.text('shared/MEMORY.md')).toBe('');
});

test('entry snapshots stay fixed for one conversation while permissions remain live', async () => {
  const f = memoryFixture();
  let allowed = true;
  const session = f.open(undefined, {
    assertAuthorized: () => {
      if (!allowed) throw new MemoryError('invalid-receipt', 'Access revoked');
      return undefined;
    },
  });
  expect((await f.service.entrySnapshot('chat-1', session)).content).toBe('');
  const file = await session.read('MEMORY.md');
  await session.commit([{ kind: 'write', receipt: file.receipt, content: 'New preference' }]);
  expect((await f.service.entrySnapshot('chat-1', session)).content).toBe('');
  expect((await f.service.entrySnapshot('chat-2', session)).content).toBe('New preference');
  allowed = false;
  await expect(f.service.entrySnapshot('chat-1', session)).rejects.toMatchObject({
    code: 'invalid-receipt',
  });
});

test('clearing keeps forgetting markers, blocks old context, and offers no model write receipt', async () => {
  const f = memoryFixture();
  const boundaries = new Map<string, string | null>();
  const open = (chat: string) =>
    f.open(undefined, {
      assertHistory: async (protection) => {
        if (boundaries.has(chat) && boundaries.get(chat) !== protection)
          throw new Error('New conversation required');
        boundaries.set(chat, protection);
      },
    });
  const previous = open('old');
  f.set('shared/MEMORY.md', 'A personal fact');
  await f.service.entrySnapshot('old', previous);
  const clear = await previous.previewClear();
  await previous.clear(clear.token);
  expect(f.text('shared/MEMORY.md')).toContain('forgotten');
  await expect(f.service.entrySnapshot('old', previous)).rejects.toThrow(
    'New conversation required',
  );
  const fresh = open('new');
  expect((await f.service.entrySnapshot('new', fresh)).content).not.toContain('A personal fact');
  const files = await fresh.readMany(['MEMORY.md', '.memories/missing.md']);
  expect(files.map((file) => file.receipt)).toEqual(['', '']);
  expect([...f.files.keys()].some((key) => key.startsWith('backups/'))).toBe(true);
});
