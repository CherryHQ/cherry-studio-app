import type { File } from 'expo-file-system';

import { serializeDiagnosticRecord } from '../diagnosticFiles';
import { readRawLines, SourceChangedError } from '../sourceCollector';

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

test('serializes Error causes and cycles without removing repeated shared objects', () => {
  const error = new Error('failure');
  error.cause = error;
  const shared = { prompt: 'original body', token: 'original token' };
  const parsed = JSON.parse(serializeDiagnosticRecord({ error, a: shared, b: shared }));
  expect(parsed.error).toMatchObject({ name: 'Error', message: 'failure', cause: '[Circular]' });
  expect(parsed.a).toEqual(shared);
  expect(parsed.b).toEqual(shared);
});
