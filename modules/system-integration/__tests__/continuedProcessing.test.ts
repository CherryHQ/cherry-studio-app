import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../ios/ContinuedProcessing.swift'), 'utf8');

test('every synchronous scheduler completion and cancellation runs on the completion queue', () => {
  const schedulerCall = /setTaskCompleted\(|cancel\(taskRequestWithIdentifier:/;
  const workerBlocks = /Self\.completionQueue\.async\s*\{[^{}]*\}/g;

  expect(source).toMatch(
    /let completionQueue = DispatchQueue\(label: "[^"]+", qos: \.userInitiated\)/,
  );
  expect(source).not.toMatch(/completionQueue\.setTarget/);
  expect(source.match(workerBlocks)?.some((block) => schedulerCall.test(block))).toBe(true);
  expect(source.replace(workerBlocks, '')).not.toMatch(schedulerCall);
});

test('leaves the expiration handler installed while the system completion is pending', () => {
  expect(source).toContain('continuedTask.expirationHandler = {');
  expect(source).not.toMatch(/expirationHandler\s*=\s*nil/);
});
