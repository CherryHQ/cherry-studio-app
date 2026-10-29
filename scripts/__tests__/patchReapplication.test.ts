import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// EAS reinstalls after prebuild, and a non-trivial pnpm install re-applies patches in place. A
// patched file whose every hunk still matches the patched source then receives the change twice
// (duplicate imports, Kotlin "Conflicting overloads"). Each patched file needs at least one hunk
// whose original lines disappear once applied.
type Hunk = { original: string[]; adds: boolean };

function patchedFiles(patch: string): Map<string, Hunk[]> {
  const files = new Map<string, Hunk[]>();
  for (const section of patch.split(/^(?=diff --git )/m)) {
    const header = /^diff --git a\/\S+ b\/(\S+)/.exec(section);
    if (!header || section.includes('\n--- /dev/null')) continue;
    const hunks = section
      .split(/^(?=@@ )/m)
      .slice(1)
      .map((hunk) => {
        const lines = hunk.split('\n').slice(1);
        return {
          adds: lines.some((line) => line.startsWith('+')),
          original: lines
            .filter((line) => line.startsWith(' ') || line.startsWith('-'))
            .map((line) => line.slice(1)),
        };
      });
    files.set(header[1], hunks);
  }
  return files;
}

function contains(source: string[], block: string[]): boolean {
  return source.some((_, start) => block.every((line, offset) => source[start + offset] === line));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');
const patches = [...workspace.matchAll(/^ {2}['"]?(.+?)['"]?: (patches\/\S+\.patch)$/gm)].map(
  ([, spec, path]) => ({ spec, path }),
);

test.each(patches)('$path cannot apply twice to its installed package', ({ spec, path }) => {
  const at = spec.lastIndexOf('@');
  const name = spec.slice(0, at);
  const prefix = `${name.replace('/', '+')}@${spec.slice(at + 1)}_patch_hash=`;
  // Earlier patch revisions can leave sibling installs; check the one the lockfile selects.
  const hash = new RegExp(`^ {2}['"]?${escapeRegExp(spec)}['"]?: (\\w+)$`, 'm').exec(lockfile)?.[1];
  const store = readdirSync('node_modules/.pnpm').find(
    (entry) =>
      entry.startsWith(prefix) && hash?.startsWith(entry.slice(prefix.length).split('_')[0]),
  );
  expect(store).toBeDefined();
  const root = join('node_modules/.pnpm', store!, 'node_modules', name);

  const reapplicable = [...patchedFiles(readFileSync(path, 'utf8'))]
    .filter(([file, hunks]) => {
      const target = join(root, file);
      if (!existsSync(target) || !hunks.some((hunk) => hunk.adds)) return false;
      const source = readFileSync(target, 'utf8').split('\n');
      return hunks.every((hunk) => contains(source, hunk.original));
    })
    .map(([file]) => file);

  expect(reapplicable).toEqual([]);
});
