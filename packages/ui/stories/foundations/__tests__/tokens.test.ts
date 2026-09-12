import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { READ_VARIABLES } from '../tokens';

const repoRoot = path.resolve(__dirname, '../../../../..');
const storiesDir = path.resolve(__dirname, '..');
const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

function braceBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`missing \`${marker}\``);
  }

  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }

  throw new Error(`unterminated \`${marker}\``);
}

const declared = (source: string) => new Set(source.match(/--[a-z0-9-]+(?=\s*:)/g) ?? []);

/**
 * Variables the runtime can actually resolve. Plain `:root`/`@variant` blocks
 * survive verbatim, and `@theme static` opts out of Tailwind's usage pruning.
 * Deliberately excluded:
 *   - `@theme inline static` — Tailwind substitutes the value into the utility,
 *     so the variable itself need not be emitted (this is why the type-scale
 *     page reads `--ui-text-*` and not `--font-weight-*`);
 *   - bare `@theme` — pruned by usage, so presence today proves nothing.
 */
const resolvable = new Set([
  ...declared(braceBlock(read('packages/design-tokens/src/styles/native.css'), '@layer theme')),
  ...declared(braceBlock(read('src/frontend/styles/global.css'), '@layer theme')),
  ...declared(braceBlock(read('src/frontend/styles/global.css'), '@theme static')),
]);

/**
 * A foundations page that names a variable wrong fails silently — the swatch
 * renders a placeholder and Uniwind logs one dev warning for the first miss
 * only. Nothing else in the build sees it, so these assertions are the guard.
 */
describe('Foundations token references', () => {
  test.each(READ_VARIABLES)('%s resolves at runtime', (variable) => {
    expect(resolvable.has(variable)).toBe(true);
  });

  test('arbitrary-value classNames name real variables too', () => {
    const referenced = new Set<string>();
    for (const file of readdirSync(storiesDir).filter((name) => name.endsWith('.tsx'))) {
      for (const [, variable] of readFileSync(path.join(storiesDir, file), 'utf8').matchAll(
        /-\[var\((--[a-z0-9-]+)\)\]/g,
      )) {
        referenced.add(variable);
      }
    }

    // Guards the regex itself: a rename that drops the last such className
    // would otherwise make this assertion vacuously pass.
    expect(referenced.size).toBeGreaterThan(0);
    expect([...referenced].filter((variable) => !resolvable.has(variable))).toEqual([]);
  });
});
