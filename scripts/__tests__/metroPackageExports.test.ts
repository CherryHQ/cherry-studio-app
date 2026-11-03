import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

// Use Expo's installed resolver without loading its Metro config or starting a bundler.
const expoRequire = createRequire(require.resolve('expo/package.json'));
const metroRequire = createRequire(expoRequire.resolve('@expo/metro-config/package.json'));
const { resolve } = jest.requireActual<{
  resolve: (
    context: Record<string, unknown>,
    moduleName: string,
    platform: string,
  ) => { type: string; filePath?: string };
}>(metroRequire.resolve('metro-resolver'));
const libp2pRequire = createRequire(realpathSync('node_modules/@libp2p/interface/package.json'));
const multiformatsRoot = join(dirname(libp2pRequire.resolve('multiformats')), '../..');

const packages = [
  {
    name: '@noble/hashes',
    version: '1.8.0',
    root: dirname(require.resolve('@noble/hashes/package.json')),
    request: '@noble/hashes/crypto',
    target: 'crypto.js',
    patch: 'patches/@noble__hashes@1.8.0.patch',
  },
  {
    name: 'multiformats',
    version: '14.0.5',
    root: multiformatsRoot,
    request: 'multiformats/hashes/sha2',
    target: 'dist/src/hashes/sha2-browser.js',
    patch: 'patches/multiformats@14.0.5.patch',
  },
];

describe.each(packages)(
  '$name browser exports',
  ({ name, version, root, request, target, patch }) => {
    test('registers the exact patch in the workspace and lockfile', () => {
      const hash = createHash('sha256').update(readFileSync(patch)).digest('hex');
      const specifier = `${name}@${version}`;

      expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(patch);
      expect(readFileSync('pnpm-lock.yaml', 'utf8')).toMatch(
        new RegExp(`['"]?${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?: ${hash}\\n`),
      );
    });

    test.each(['android', 'ios', 'web'])(
      'keeps the existing browser file without export fallback on %s',
      (platform) => {
        const packageJson: { name: string; exports: Record<string, unknown> } = JSON.parse(
          readFileSync(join(root, 'package.json'), 'utf8'),
        );
        const warnings: string[] = [];
        const context = {
          originModulePath: join(process.cwd(), 'index.ts'),
          allowHaste: false,
          assetExts: new Set<string>(),
          customResolverOptions: {},
          disableHierarchicalLookup: true,
          extraNodeModules: { [name]: root },
          nodeModulesPaths: [],
          dev: false,
          mainFields: ['react-native', 'browser', 'main'],
          preferNativePlatform: true,
          sourceExts: ['js', 'json', 'ts', 'tsx'],
          unstable_conditionNames: ['react-native'],
          unstable_conditionsByPlatform: { web: ['browser'] },
          unstable_enablePackageExports: true,
          unstable_incrementalResolution: false,
          unstable_logWarning: (message: string) => warnings.push(message),
          doesFileExist: (path: string) =>
            statSync(path, { throwIfNoEntry: false })?.isFile() ?? false,
          fileSystemLookup: (path: string) => {
            const stat = statSync(path, { throwIfNoEntry: false });
            return stat
              ? { exists: true, type: stat.isDirectory() ? 'd' : 'f', realPath: realpathSync(path) }
              : { exists: false };
          },
          getPackage: (path: string) => (path === join(root, 'package.json') ? packageJson : null),
          getPackageForModule: (path: string) =>
            path.startsWith(`${root}${sep}`)
              ? { rootPath: root, packageJson, packageRelativePath: relative(root, path) }
              : null,
          resolveAsset: () => null,
          resolveHasteModule: () => null,
          resolveHastePackage: () => null,
        };

        for (const isESMImport of [true, false]) {
          expect(resolve({ ...context, isESMImport }, request, platform)).toEqual({
            type: 'sourceFile',
            filePath: realpathSync(join(root, target)),
          });
        }
        expect(warnings).toEqual([]);
      },
    );
  },
);
