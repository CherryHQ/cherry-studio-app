import { selectBundleSources } from '../sourceSelection';
import type { SourceCandidate } from '../types';

function file(
  name: string,
  kind: 'logs' | 'traces',
  bytes: number,
  latestAt: number,
): SourceCandidate {
  return {
    archiveName: name,
    eligibleBytes: bytes,
    identity: { size: bytes, modifiedAt: latestAt, fileKey: name },
    kind,
    latestAt,
    malformedLineCount: 0,
    sourcePath: name,
  };
}
test('represents both sources before filling the budget with recent files', () => {
  const logs = file('logs/new', 'logs', 600, 30);
  const olderLog = file('logs/old', 'logs', 200, 20);
  const traces = file('traces/one', 'traces', 300, 10);
  const selection = selectBundleSources([logs, olderLog, traces], 1000);
  expect(selection.selectedFiles).toEqual([logs, traces]);
  expect(selection.omittedFiles).toEqual([olderLog]);
});

test('skips an oversized file and admits smaller recent files within the exact budget', () => {
  const oversized = file('logs/large', 'logs', 1001, 30);
  const smaller = file('logs/small', 'logs', 400, 20);
  const traces = file('traces/one', 'traces', 600, 10);
  expect(selectBundleSources([oversized, smaller, traces], 1000)).toEqual({
    selectedFiles: [smaller, traces],
    omittedFiles: [oversized],
  });
});
