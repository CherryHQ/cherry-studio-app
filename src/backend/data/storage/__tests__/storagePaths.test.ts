import { cleanupStorageAfterBoot } from '../storagePaths';

const mockDocumentUri = 'file:///data/user/0/app/files';
const mockExisting = new Set<string>();

jest.mock('expo-sqlite', () => ({ defaultDatabaseDirectory: '/data/user/0/app/files/SQLite' }));

jest.mock('expo-file-system', () => {
  const join = (...parts: (string | { uri: string })[]) => {
    const uri = parts
      .map((part) => (typeof part === 'string' ? part : part.uri))
      .reduce((base, part) => (base ? `${base.replace(/\/$/, '')}/${part}` : part), '');
    // Android rejects plain paths: java.lang.IllegalArgumentException: URI is not absolute.
    if (!uri.startsWith('file://')) throw new Error('URI is not absolute');
    return uri;
  };
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    list() {
      return [];
    }
    delete() {
      mockExisting.delete(this.uri);
    }
  }
  class MockFile extends MockDirectory {}
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      document: new MockDirectory('file:///data/user/0/app/files'),
      cache: new MockDirectory('file:///cache'),
    },
  };
});

jest.mock('../../../../../modules/backup-storage', () => ({
  getBackupStorage: () => ({
    processId: () => '10000000-0000-4000-8000-000000000002',
    readControl: () =>
      JSON.stringify({ version: 1, current: '20000000-0000-4000-8000-000000000001' }),
    writeControl: () => {},
  }),
}));

test('cleanup after a restore removes the legacy database through file URIs', () => {
  const legacyDatabase = `${mockDocumentUri}/SQLite/cherry.db`;
  mockExisting.add(legacyDatabase);

  expect(() => cleanupStorageAfterBoot()).not.toThrow();
  expect(mockExisting.has(legacyDatabase)).toBe(false);
});
