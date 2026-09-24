import { selectBootStorage, StorageControlSchema, type StorageControl } from '../storageControl';

const oldProcess = '10000000-0000-4000-8000-000000000001';
const newProcess = '10000000-0000-4000-8000-000000000002';
const followingProcess = '10000000-0000-4000-8000-000000000003';
const candidate = '20000000-0000-4000-8000-000000000001';
const staged: StorageControl = {
  version: 1,
  current: 'legacy',
  pending: { id: candidate, processId: oldProcess, phase: 'staged' },
};

test('a JS reload cannot activate storage while native SQLite handles may still exist', () => {
  expect(selectBootStorage(staged, oldProcess)).toMatchObject({
    storageId: 'legacy',
    restoring: false,
    restartRequired: true,
  });
  expect(selectBootStorage(staged, newProcess)).toMatchObject({
    storageId: candidate,
    restoring: true,
    restartRequired: false,
    control: {
      current: 'legacy',
      pending: { id: candidate, processId: newProcess, phase: 'activating' },
    },
  });
});

test('a process killed during candidate initialization rolls back before opening storage', () => {
  const activating = selectBootStorage(staged, newProcess).control;
  const recovered = selectBootStorage(activating, followingProcess);
  expect(recovered).toMatchObject({
    storageId: 'legacy',
    restoring: false,
    restartRequired: false,
  });
  expect(recovered.control.pending).toBeUndefined();
  expect(recovered.control.lastResult).toBe('rolled-back');
  expect(recovered.resetCaches).toBe(true);
  expect(recovered.outcome).toBe('rolled-back');
  expect(selectBootStorage(recovered.control, followingProcess).outcome).toBeUndefined();
});

test('a failed candidate requires a native restart before reopening the previous generation', () => {
  const failed: StorageControl = {
    version: 1,
    current: 'legacy',
    failedProcessId: newProcess,
    lastResult: 'rolled-back',
  };
  expect(selectBootStorage(failed, newProcess).restartRequired).toBe(true);
  expect(selectBootStorage(failed, followingProcess)).toMatchObject({
    storageId: 'legacy',
    restartRequired: false,
    resetCaches: true,
    outcome: 'rolled-back',
  });
  const recovered = selectBootStorage(failed, followingProcess).control;
  expect(selectBootStorage(recovered, followingProcess)).toMatchObject({ resetCaches: false });
  expect(selectBootStorage(recovered, followingProcess).outcome).toBeUndefined();
});

test('the durable record rejects arbitrary paths, unsupported versions and unknown fields', () => {
  for (const invalid of [
    { ...staged, current: '../other' },
    { ...staged, version: 2 },
    { ...staged, fallback: 'legacy' },
    { ...staged, previous: 'legacy' },
    { ...staged, pending: { ...staged.pending, id: 'legacy' } },
  ])
    expect(StorageControlSchema.safeParse(invalid).success).toBe(false);
});
