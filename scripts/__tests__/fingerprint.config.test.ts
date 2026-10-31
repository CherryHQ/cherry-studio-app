import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createFingerprintAsync } from 'expo/fingerprint';

const anydocPath = 'node_modules/react-native-anydoc';
let projectRoot: string;

function writePackageFile(relativePath: string, content: string) {
  const file = join(projectRoot, anydocPath, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fingerprint() {
  return createFingerprintAsync(projectRoot, {
    // Supply the package directory that Android autolinking hashes without invoking native tools.
    platforms: [],
    useRNCoreAutolinkingFromExpo: true,
    extraSources: [{ type: 'dir', filePath: anydocPath, reasons: ['rncoreAutolinkingAndroid'] }],
  });
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cherry-fingerprint-'));
  copyFileSync(
    join(__dirname, '../../fingerprint.config.js'),
    join(projectRoot, 'fingerprint.config.js'),
  );
  writePackageFile(
    'package.json',
    JSON.stringify({ name: 'react-native-anydoc', version: '0.4.1' }),
  );
  writePackageFile('android/src/AnydocModule.kt', 'class AnydocModule');
  writePackageFile('ios/Anydoc.swift', 'class Anydoc {}');
  writePackageFile('scripts/install-anydoc-core.js', 'const version = "0.4.1";');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('the macOS-only AnyDoc download does not change the Android package fingerprint', async () => {
  const linux = await fingerprint();
  writePackageFile('ios/AnydocCore.xcframework/Info.plist', '<plist/>');
  writePackageFile(
    'ios/AnydocCore.xcframework/ios-arm64/AnydocCore.framework/AnydocCore',
    'binary',
  );
  const mac = await fingerprint();
  expect(mac.hash).toBe(linux.hash);

  rmSync(join(projectRoot, anydocPath, 'ios/AnydocCore.xcframework'), { recursive: true });
  expect((await fingerprint()).hash).toBe(linux.hash);
});

test.each([
  ['package.json', JSON.stringify({ name: 'react-native-anydoc', version: '0.4.2' })],
  ['android/src/AnydocModule.kt', 'class ChangedAnydocModule'],
  ['ios/Anydoc.swift', 'class ChangedAnydoc {}'],
  ['scripts/install-anydoc-core.js', 'const version = "0.4.2";'],
])('AnyDoc %s changes still invalidate compatibility', async (file, content) => {
  const before = await fingerprint();
  writePackageFile(file, content);
  expect((await fingerprint()).hash).not.toBe(before.hash);
});

test('workspace package fingerprints ignore generated command shims but track native sources', async () => {
  const packagePath = 'packages/ui';
  const nativeFile = join(projectRoot, packagePath, 'ios/View.swift');
  const shimFile = join(projectRoot, packagePath, 'node_modules/.bin/react-native');
  mkdirSync(dirname(nativeFile), { recursive: true });
  mkdirSync(dirname(shimFile), { recursive: true });
  writeFileSync(nativeFile, 'class View {}');
  const options = {
    platforms: [],
    useRNCoreAutolinkingFromExpo: true,
    extraSources: [
      { type: 'dir' as const, filePath: packagePath, reasons: ['rncoreAutolinkingIos'] },
    ],
  };
  const before = await createFingerprintAsync(projectRoot, options);
  writeFileSync(shimFile, '#!/bin/sh\nexec node /checkout/node_modules/react-native/cli.js "$@"\n');
  expect((await createFingerprintAsync(projectRoot, options)).hash).toBe(before.hash);
  writeFileSync(
    shimFile,
    '#!/bin/sh\nexec node /eas-build/node_modules/react-native/cli.js "$@"\n',
  );
  expect((await createFingerprintAsync(projectRoot, options)).hash).toBe(before.hash);
  writeFileSync(nativeFile, 'class ChangedView {}');
  expect((await createFingerprintAsync(projectRoot, options)).hash).not.toBe(before.hash);
});

test('SSH fingerprints ignore downloaded sources but track the committed version pin', async () => {
  const modulePath = 'modules/ssh';
  const pin = join(projectRoot, modulePath, 'upstream.json');
  const cachedSource = join(projectRoot, modulePath, '.cache/libssh2-digest/src/session.c');
  mkdirSync(dirname(pin), { recursive: true });
  writeFileSync(pin, JSON.stringify({ archiveSha256: 'first' }));
  const options = {
    platforms: [],
    useRNCoreAutolinkingFromExpo: true,
    extraSources: [
      { type: 'dir' as const, filePath: modulePath, reasons: ['expoAutolinkingAndroid'] },
    ],
  };
  const before = await createFingerprintAsync(projectRoot, options);
  mkdirSync(dirname(cachedSource), { recursive: true });
  writeFileSync(cachedSource, 'downloaded source');
  expect((await createFingerprintAsync(projectRoot, options)).hash).toBe(before.hash);
  writeFileSync(pin, JSON.stringify({ archiveSha256: 'second' }));
  expect((await createFingerprintAsync(projectRoot, options)).hash).not.toBe(before.hash);
});
