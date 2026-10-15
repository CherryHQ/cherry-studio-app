import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const fileHashSwift = readFileSync(
  join(
    dirname(require.resolve('@preeternal/react-native-file-hash/package.json')),
    'ios/Engines/Native/Swift/FileHash.swift',
  ),
  'utf8',
);

// Upgrade guard for the patched iOS SHA-256 loop. Upstream only checks cancellation after the
// whole file is read and treats a failed read as end of file, so a backup manifest could record
// the hash of a truncated prefix.
test('iOS file hashing checks cancellation per chunk and propagates read errors', () => {
  const loop = fileHashSwift
    .split('private func processFile<H: HashFunction>(')[1]
    ?.split('private func processFileHMAC(')[0];

  expect(loop).toContain('while try autoreleasepool(invoking: { () throws -> Bool in');
  expect(loop).toContain(
    'try throwIfCancelled(operation)\n            guard let data = try fileHandle',
  );
  expect(loop).not.toContain('try? fileHandle.read');
});
