import type { File } from 'expo-file-system';

import { projectDiagnosticLine, readRawLines, SourceChangedError } from '../sourceCollector';

function snapshot(bytes: Uint8Array, claimedSize = bytes.length) {
  const close = jest.fn();
  const file = {
    size: claimedSize,
    open: () => {
      let offset = 0;
      return {
        close,
        readBytes: (size: number) => {
          const result = bytes.subarray(offset, offset + size);
          offset += result.length;
          return result;
        },
      };
    },
  } as unknown as File;
  return { file, close };
}

test('preserves raw bytes across chunk boundaries and the last unterminated line', async () => {
  const first = `${'中'.repeat(23000)}\r\n`;
  const final = '{"raw":"secret"}';
  const { file, close } = snapshot(new TextEncoder().encode(first + final));
  const lines = [];
  for await (const line of readRawLines(file)) lines.push(new TextDecoder().decode(line.data));
  expect(lines).toEqual([first, final]);
  expect(close).toHaveBeenCalledTimes(1);
});

test('detects a truncated snapshot and closes the handle even on reader cancellation', async () => {
  const { file, close } = snapshot(new Uint8Array([10]), 100);
  await expect(
    (async () => {
      for await (const line of readRawLines(file)) {
        expect(line.tooLarge).toBe(false);
      }
    })(),
  ).rejects.toBeInstanceOf(SourceChangedError);
  expect(close).toHaveBeenCalledTimes(1);
  const aborted = snapshot(new Uint8Array([10]));
  const controller = new AbortController();
  controller.abort();
  await expect(readRawLines(aborted.file, 1, controller.signal).next()).rejects.toBeDefined();
  expect(aborted.close).toHaveBeenCalledTimes(1);
});

test('rejects legacy raw logs and reprojects metadata before range filtering', () => {
  const line = (value: unknown) => ({
    tooLarge: false,
    data: new TextEncoder().encode(JSON.stringify(value)),
  });
  const range = { fromMs: 1000, toMs: 2000 };
  const record = {
    schemaVersion: 1,
    capture: 'metadata',
    timestamp: new Date(1500).toISOString(),
    level: 'error',
    module: 'HTTP',
    message: 'private request',
    facts: { statusCode: 401, responseBody: 'private body' },
  };
  expect(projectDiagnosticLine(line({ ...record, capture: 'raw' }), 'logs', range)).toBe(
    'malformed',
  );
  const projected = projectDiagnosticLine(line(record), 'logs', range);
  if (!projected || projected === 'malformed') throw new Error('Expected metadata');
  const text = new TextDecoder().decode(projected.data);
  expect(JSON.parse(text)).toMatchObject({ facts: { statusCode: 401 } });
  expect(text).not.toContain('private');
  expect(projectDiagnosticLine(line(record), 'logs', { fromMs: 1600, toMs: 2000 })).toBeUndefined();
});
