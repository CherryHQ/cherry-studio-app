/**
 * Locate the generated `data/` catalog from a test, under either runner.
 *
 * The package's own `pnpm test` runs vitest as ESM (`import.meta.url` is
 * available, `__dirname` is not), while the app's root jest transpiles these
 * same files to CJS (`__dirname` is available, babel turns `import.meta.url`
 * into null). Desktop only has the vitest half, so keep the fallback here
 * rather than re-deriving it in every ported suite.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir =
  typeof __dirname === 'undefined' ? dirname(fileURLToPath(import.meta.url)) : __dirname;

export const catalogDataDir = join(moduleDir, '..', '..', 'data');

export function readCatalogJson<T = unknown>(fileName: string): T {
  return JSON.parse(readFileSync(join(catalogDataDir, fileName), 'utf8')) as T;
}
