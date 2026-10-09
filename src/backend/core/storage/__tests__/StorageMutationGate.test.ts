import { StorageMutationGate } from '../StorageMutationGate';

test('rejects new work only while frozen, and a duplicate release cannot thaw a later freeze', () => {
  const gate = new StorageMutationGate();
  expect(() => gate.assertWritable()).not.toThrow();
  const thaw = gate.freeze();
  expect(gate.isFrozen).toBe(true);
  expect(() => gate.assertWritable()).toThrow('busy');
  expect(() => gate.freeze()).toThrow('busy');
  thaw();
  const refreeze = gate.freeze();
  thaw();
  expect(gate.isFrozen).toBe(true);
  refreeze();
  expect(gate.isFrozen).toBe(false);
});
