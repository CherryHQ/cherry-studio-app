import { shouldRunMemoryBootstrap } from '../memoryBootstrap';
import { memoryContext } from '../memoryContext';
import type { AgentMemorySnapshot } from '../memoryTypes';

function snapshot(bootstrapCompleted: boolean | null, soul = ''): AgentMemorySnapshot {
  return {
    bootstrapCompleted,
    soul: { key: 'soul', content: soul, version: 'soul-revision', truncated: false },
    user: { key: 'user', content: '', version: 'missing', truncated: false },
    fact: { key: 'fact', content: '', version: 'missing', truncated: false },
  };
}

test('explicit completion and restart override whether SOUL has content', () => {
  expect(shouldRunMemoryBootstrap(snapshot(true))).toBe(false);
  expect(shouldRunMemoryBootstrap(snapshot(false, 'Established persona '.repeat(10)))).toBe(true);
});

test('legacy Agents use Desktop’s substantive SOUL check rather than file existence', () => {
  expect(shouldRunMemoryBootstrap(snapshot(null))).toBe(true);
  expect(shouldRunMemoryBootstrap(snapshot(null, 'x'.repeat(50)))).toBe(true);
  expect(shouldRunMemoryBootstrap(snapshot(null, 'x'.repeat(51)))).toBe(false);
  expect(
    shouldRunMemoryBootstrap(
      snapshot(null, '# Template heading '.repeat(10) + '\n> Instructions '.repeat(10)),
    ),
  ).toBe(true);
  const unavailable = snapshot(null);
  unavailable.soul.version = 'unavailable';
  expect(shouldRunMemoryBootstrap(unavailable)).toBe(false);
});

test('only writable setup turns receive onboarding and completed snapshots withdraw it', () => {
  const pending = snapshot(false, 'An existing role '.repeat(10));
  expect(memoryContext(pending, true).text).toContain('## Bootstrap Mode');
  expect(memoryContext(pending).text).not.toContain('## Bootstrap Mode');
  const completed = memoryContext({ ...pending, bootstrapCompleted: true }, true);
  expect(completed.key).toBe(memoryContext(pending, true).key);
  expect(completed.text).not.toContain('## Bootstrap Mode');
  expect(completed.text).toContain('withdraws all earlier Bootstrap Mode guidance');
  expect(completed.text).toContain(pending.soul.content);
});
