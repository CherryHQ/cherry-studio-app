import { StorageMutationGate } from '../StorageMutationGate';

test('cannot freeze over an admitted write, including one waiting for other work', async () => {
  const gate = new StorageMutationGate();
  let finish!: () => void;
  const write = gate.run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  expect(() => gate.freeze()).toThrow('busy');
  finish();
  await write;
  const release = gate.freeze();
  expect(() => gate.enter()).toThrow('busy');
  release();
  expect(gate.isFrozen).toBe(false);
});

test('failed operations release their lease and duplicate release cannot hide another writer', async () => {
  const gate = new StorageMutationGate();
  await expect(
    gate.run(async () => {
      throw new Error('write failed');
    }),
  ).rejects.toThrow('write failed');
  const first = gate.enter();
  const second = gate.enter();
  first();
  first();
  expect(() => gate.freeze()).toThrow('busy');
  second();
  const thaw = gate.freeze();
  thaw();
  const refreeze = gate.freeze();
  thaw();
  expect(gate.isFrozen).toBe(true);
  refreeze();
});
