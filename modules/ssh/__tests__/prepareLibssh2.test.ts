import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { prepareLibssh2 } from '../prepareLibssh2.cjs';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));

const archive = Buffer.from('archive fixture');
const digest = createHash('sha256').update(archive).digest('hex');
let directory: string;

function writePin(archiveSha256 = digest) {
  writeFileSync(
    join(directory, 'upstream.json'),
    JSON.stringify({
      archiveUrl: 'https://example.test/libssh2.tar.gz',
      archiveSha256,
    }),
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ssh-source-'));
  writePin();
  jest.mocked(execFileSync).mockReset();
  jest.mocked(execFileSync).mockImplementation((command, args) => {
    const argv = Array.isArray(args) ? args : [];
    if (command === 'curl') writeFileSync(argv[argv.indexOf('--output') + 1], archive);
    else if (command === 'tar') {
      const source = argv[argv.indexOf('-C') + 1];
      for (const file of ['include/libssh2.h', 'src/libssh2_priv.h', 'COPYING']) {
        const path = join(source, file);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, 'source fixture');
      }
    }
    return Buffer.alloc(0);
  });
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

test('reuses a complete digest-keyed source cache without contacting the network again', () => {
  const source = prepareLibssh2(directory);
  expect(existsSync(join(directory, source, 'include/libssh2.h'))).toBe(true);
  expect(readdirSync(join(directory, '.cache'))).toEqual([`libssh2-${digest}`]);
  jest.mocked(execFileSync).mockClear();
  expect(prepareLibssh2(directory)).toBe(source);
  expect(execFileSync).not.toHaveBeenCalled();
});

test('rejects a corrupt download before extraction and leaves no reusable partial source', () => {
  writePin('0'.repeat(64));
  expect(() => prepareLibssh2(directory)).toThrow('SHA-256 mismatch');
  expect(jest.mocked(execFileSync).mock.calls.map(([command]) => command)).toEqual(['curl']);
  expect(readdirSync(join(directory, '.cache'))).toEqual([]);
});

test('changing the digest cannot silently reuse a previously downloaded version', () => {
  const previous = prepareLibssh2(directory);
  writePin('0'.repeat(64));
  expect(() => prepareLibssh2(directory)).toThrow('SHA-256 mismatch');
  expect(existsSync(join(directory, previous, 'include/libssh2.h'))).toBe(true);
});
