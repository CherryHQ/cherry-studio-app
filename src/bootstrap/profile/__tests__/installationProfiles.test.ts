import { Directory, File, Paths } from 'expo-file-system';

import { getActiveProfile, LOCAL_PROFILE, setActiveProfile } from '@/shared/data/activeProfile';
import { PreferenceDefaults, ThemeMode } from '@/shared/data/preference';

import { installationProfiles, selectActiveProfile } from '../installationProfiles';

const mockStorage = new Map<string, string>();
const mockPreferences = {
  ...PreferenceDefaults,
  'ui.theme_mode': ThemeMode.dark,
  'app.user.name': 'Do not inherit',
};
const mockFiles = new Set<string>();
let mockDeletionFails = false;
const profileId = '8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60';

jest.mock('expo-crypto', () => ({ randomUUID: () => '8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60' }));
jest.mock('@/backend/core/application/Application', () => ({
  application: {
    get: () => ({
      getMultipleRawCached: (keys: (keyof typeof mockPreferences)[]) =>
        Object.fromEntries(keys.map((key) => [key, mockPreferences[key]])),
    }),
  },
}));
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
  }),
}));
jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory extends File {
    get exists() {
      return [...mockFiles].some((path) => path.startsWith(`${this.uri}/`));
    }
    delete() {
      if (mockDeletionFails) throw new Error('Cache unavailable');
      for (const path of mockFiles) if (path.startsWith(`${this.uri}/`)) mockFiles.delete(path);
    }
    list() {
      return [...mockFiles]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
  }
  return {
    File,
    Directory,
    Paths: { cache: new Directory('cache'), document: new Directory('documents') },
  };
});

beforeEach(() => {
  mockStorage.clear();
  mockFiles.clear();
  mockDeletionFails = false;
  setActiveProfile(LOCAL_PROFILE);
  installationProfiles().setActive(LOCAL_PROFILE);
  for (const name of [
    'PdfText',
    'FilePreviewImages',
    'mcp-tool-catalog',
    'RemoteAttachments',
    'FileExports',
    'FeedbackScreenshots',
    'ImagePicker',
  ])
    mockFiles.add(new File(new Directory(Paths.cache, name), 'fixture').uri);
  mockFiles.add('cache/app-updates/package.apk');
  mockFiles.add('cache/ExponentAsset-bundled-font');
  mockFiles.add('documents/Diagnostics/logs-v1/history.log');
  mockFiles.add('documents/SQLite/cherry.db');
});

test('clears legacy content once without deleting databases, diagnostic history or app assets', () => {
  selectActiveProfile();
  expect(mockFiles).toEqual(
    new Set([
      'cache/app-updates/package.apk',
      'cache/ExponentAsset-bundled-font',
      'documents/Diagnostics/logs-v1/history.log',
      'documents/SQLite/cherry.db',
    ]),
  );
  mockFiles.add('cache/PdfText/current.json');
  selectActiveProfile();
  expect(mockFiles.has('cache/PdfText/current.json')).toBe(true);
});

test('clears content when the selected profile changes and retains the new profile on restart', () => {
  mockStorage.set('cache-owner', 'local');
  const profile = installationProfiles().resolve(
    { deployment: 'deployment', subject: 'subject', authentication: 'password' },
    'https://example.com',
  );
  installationProfiles().setActive(profile);
  selectActiveProfile();
  expect(getActiveProfile().id).toBe(profileId);
  expect(getActiveProfile()).toMatchObject({
    initialPreferences: { 'ui.theme_mode': ThemeMode.dark },
  });
  expect(getActiveProfile()).not.toHaveProperty(['initialPreferences', 'app.user.name']);
  expect(mockFiles.has('cache/PdfText/fixture')).toBe(false);
  expect(mockStorage.get('cache-owner')).toBe(profileId);
  mockFiles.add('cache/PdfText/current.json');
  selectActiveProfile();
  expect(mockFiles.has('cache/PdfText/current.json')).toBe(true);
});

test('keeps the old cache owner and profile closed until failed cleanup succeeds', () => {
  mockStorage.set('cache-owner', 'previous-profile');
  mockDeletionFails = true;
  expect(selectActiveProfile).toThrow('Cache unavailable');
  expect(mockStorage.get('cache-owner')).toBe('previous-profile');
  expect(mockFiles.has('cache/PdfText/fixture')).toBe(true);
  mockDeletionFails = false;
  selectActiveProfile();
  expect(mockStorage.get('cache-owner')).toBe('local');
  expect(mockFiles.has('cache/PdfText/fixture')).toBe(false);
});
