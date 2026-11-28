import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ios = join(__dirname, '../ios');
const source = readFileSync(join(ios, 'ContinuedProcessing.swift'), 'utf8');
const workerBlocks = /Self\.completionQueue\.async\s*\{[^{}]*\}/g;

test('scheduler completion and cancellation stay off the main queue', () => {
  expect(source).toMatch(/let completionQueue = DispatchQueue\(label:/);
  expect(source).not.toMatch(/target:\s*\.main/);
  expect(source.replace(workerBlocks, '')).not.toMatch(
    /setTaskCompleted\(|cancel\(taskRequestWithIdentifier:/,
  );
});

test('JavaScript receives its acknowledgement after native cleanup', () => {
  const blocks = source.match(workerBlocks) ?? [];
  const cleanupOrder =
    /setTaskCompleted\([^)]*\)\s*BGTaskScheduler\.shared\.cancel\([^)]*\)\s*completion\(\)/;
  expect(blocks.some((block) => cleanupOrder.test(block))).toBe(true);
  const bridge = readFileSync(join(ios, 'SystemIntegrationModule.swift'), 'utf8');
  expect(bridge).toContain('tasks.end(id: id, success: success) { promise.resolve() }');
});
