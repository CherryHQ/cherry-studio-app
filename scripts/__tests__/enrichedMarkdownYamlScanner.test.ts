import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const packageDirectory = dirname(require.resolve('react-native-enriched-markdown/package.json'));

test('vendoring repairs cached YAML status types and stays idempotent without redownloading', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cherry-yaml-scanner-'));
  try {
    const manifest = JSON.parse(
      readFileSync(join(packageDirectory, 'cpp/highlight/grammar-versions.json'), 'utf8'),
    );
    const spec = manifest.grammars.yaml;
    const vendor = join(directory, 'vendor');
    const runtime = join(vendor, 'tree-sitter');
    const grammar = join(vendor, 'grammars/yaml');
    mkdirSync(join(runtime, 'src'), { recursive: true });
    mkdirSync(grammar, { recursive: true });
    writeFileSync(join(runtime, 'src/lib.c'), '/* Cached runtime; never compiled here. */');
    writeFileSync(
      join(runtime, '.stamp'),
      `${manifest.runtime.ref}|${manifest.runtime.sha256}|tarball\n`,
    );
    writeFileSync(join(grammar, 'parser.c'), '/* Cached parser. */');
    const statusFunctions = ['scn_uri_esc', 'scn_ns_uri_char', 'scn_ns_tag_char'];
    writeFileSync(
      join(grammar, 'scanner.c'),
      statusFunctions.map((name) => `static char ${name}(void) { return -1; }`).join('\n'),
    );
    const stamp = createHash('sha256')
      .update(JSON.stringify([`yaml|${spec.package}@${spec.version}|scanner:true|sub:|shared:`]))
      .digest('hex');
    writeFileSync(join(vendor, 'grammars/.stamp'), stamp);
    const manifestPath = join(directory, 'manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({ runtime: manifest.runtime, grammars: { yaml: spec } }),
    );
    const restore = () =>
      spawnSync(
        process.execPath,
        [
          join(packageDirectory, 'vendor-grammars.mjs'),
          '--from-npm',
          '--vendor-dir',
          vendor,
          '--manifest',
          manifestPath,
        ],
        { encoding: 'utf8', timeout: 10_000, env: { ...process.env, TREE_SITTER_SRC: '' } },
      );
    const first = restore();
    expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });
    expect(first.stdout).toContain('grammar sources already up to date; skipping.');
    const repaired = readFileSync(join(grammar, 'scanner.c'), 'utf8');
    for (const name of statusFunctions) expect(repaired).toContain(`static int ${name}(`);
    const second = restore();
    expect(second.status).toBe(0);
    expect(readFileSync(join(grammar, 'scanner.c'), 'utf8')).toBe(repaired);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
