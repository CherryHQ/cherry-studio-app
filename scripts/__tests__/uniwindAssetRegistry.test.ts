import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const dependency = 'uniwind@1.6.5';
const packageDirectory = dirname(require.resolve('uniwind/package.json'));

test('registers the Uniwind asset registry compatibility patch', () => {
  const patchPath = `patches/${dependency}.patch`;
  const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');

  expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
  expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
});

test('bundled assets remain resolvable through the native styling entry', () => {
  const asset = { name: 'document-preview', type: 'html' };
  const registry = { getAssetByID: (id: number) => (id === 42 ? asset : undefined) };
  const native = { AssetRegistry: registry };
  const shimModule = { exports: {} as typeof native };

  // Metro redirects expo-asset's react-native import to this entry. Execute the
  // installed shim so a missing export cannot be hidden by Jest's RN mock.
  runInNewContext(readFileSync(join(packageDirectory, 'src/components/index.ts'), 'utf8'), {
    module: shimModule,
    require: (name: string) => {
      if (name === 'react-native') return native;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  expect(shimModule.exports.AssetRegistry).toBe(registry);
  expect(shimModule.exports.AssetRegistry.getAssetByID(42)).toBe(asset);
});
