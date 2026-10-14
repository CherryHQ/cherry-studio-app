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
