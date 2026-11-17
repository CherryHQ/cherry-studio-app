/* global __dirname */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } = require('node:fs');
const { join } = require('node:path');

/** Fetch once per archive digest; only publish a fully verified, extracted tree. */
function prepareLibssh2(moduleRoot = __dirname) {
  const pin = JSON.parse(readFileSync(join(moduleRoot, 'upstream.json'), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(pin.archiveSha256) || !pin.archiveUrl.startsWith('https://'))
    throw new Error('Invalid libssh2 source pin');
  const relativeSource = `.cache/libssh2-${pin.archiveSha256}`;
  const source = join(moduleRoot, relativeSource);
  const isComplete = () =>
    ['include/libssh2.h', 'src/libssh2_priv.h', 'COPYING'].every((file) =>
      existsSync(join(source, file)),
    );
  if (isComplete()) return relativeSource;
  if (existsSync(source)) throw new Error(`Incomplete libssh2 cache; remove ${source} and retry`);

  const cache = join(moduleRoot, '.cache');
  mkdirSync(cache, { recursive: true });
  const temporary = mkdtempSync(join(cache, 'download-'));
  try {
    const archive = join(temporary, 'libssh2.tar.gz');
    execFileSync(
      'curl',
      [
        '--fail',
        '--location',
        '--silent',
        '--show-error',
        '--retry',
        '2',
        '--connect-timeout',
        '30',
        '--max-time',
        '120',
        '--retry-max-time',
        '180',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--output',
        archive,
        pin.archiveUrl,
      ],
      { stdio: 'inherit', timeout: 210000 },
    );
    const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
    if (actual !== pin.archiveSha256) throw new Error('libssh2 archive SHA-256 mismatch');
    const extracted = join(temporary, 'source');
    mkdirSync(extracted);
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted], {
      stdio: 'inherit',
      timeout: 30000,
    });
    for (const file of ['include/libssh2.h', 'src/libssh2_priv.h', 'COPYING'])
      if (!existsSync(join(extracted, file))) throw new Error(`libssh2 archive is missing ${file}`);
    try {
      renameSync(extracted, source);
    } catch (error) {
      // Separate ABI configurations can download concurrently; the first complete tree wins.
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !isComplete()) throw error;
    }
    return relativeSource;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { prepareLibssh2 };
if (require.main === module) {
  try {
    process.stdout.write(prepareLibssh2());
  } catch (error) {
    console.error(`[Ssh] ${error.message}`);
    process.exitCode = 1;
  }
}
