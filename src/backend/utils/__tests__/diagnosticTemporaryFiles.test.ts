import {
  cleanupDiagnosticTemporaryDirectories,
  createDiagnosticTemporaryDirectory,
} from '../diagnosticTemporaryFiles';

const mockDirectories = new Set<string>();
const mockFiles = new Set<string>();
const parent = 'file:///cache/Diagnostics/';
const id = '10000000-0000-4000-8000-000000000001';

function mockEntries(uri: string): string[] {
  return [...mockDirectories, ...mockFiles]
    .filter((path) => path.startsWith(uri) && path !== uri)
    .map((path) => path.slice(uri.length).replace(/\/$/, ''))
    .filter((name) => !name.includes('/'));
}
const mockReadDirectory = jest.fn(async (uri: string) => mockEntries(uri));

jest.mock('expo-crypto', () => ({ randomUUID: () => '20000000-0000-4000-8000-000000000002' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = `${parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/+$/, '')).join('/')}/`;
    }
    create() {
      let uri = this.uri;
      while (uri !== 'file:///') {
        mockDirectories.add(uri);
        uri = uri.slice(0, uri.lastIndexOf('/', uri.length - 2) + 1);
      }
    }
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => ({
    exists: mockDirectories.has(uri) || mockFiles.has(uri.replace(/\/$/, '')),
    isDirectory: mockDirectories.has(uri),
  }),
  readDirectoryAsync: (uri: string) => mockReadDirectory(uri),
  deleteAsync: async (uri: string) => {
    for (const directory of mockDirectories)
      if (directory.startsWith(uri)) mockDirectories.delete(directory);
    for (const file of mockFiles) if (file.startsWith(uri)) mockFiles.delete(file);
  },
}));

beforeEach(() => {
  mockDirectories.clear();
  mockFiles.clear();
  mockReadDirectory.mockReset().mockImplementation(async (uri) => mockEntries(uri));
  mockDirectories.add(parent);
});

test('reclaims previous runs and legacy bundles/snapshots without removing current or unknown files', async () => {
  for (const name of [id, `trace-${id}`, `run-${id}`]) {
    mockDirectories.add(`${parent}${name}/`);
    mockFiles.add(`${parent}${name}/abandoned.zip`);
  }
  const current = createDiagnosticTemporaryDirectory('upload');
  const snapshot = createDiagnosticTemporaryDirectory('trace-current');
  const retained = [
    `${current.uri}archive.zip`,
    `${snapshot.uri}trace.jsonl`,
    `${parent}unknown/keep.txt`,
    `${parent}30000000-0000-4000-8000-000000000003`,
    'file:///documents/Diagnostics/logs-v1/history.log',
  ];
  mockDirectories.add(`${parent}unknown/`);
  for (const file of retained) mockFiles.add(file);
  await cleanupDiagnosticTemporaryDirectories();
  expect([...mockFiles].sort()).toEqual(retained.sort());
  expect(mockDirectories.has(`${parent}run-${id}/`)).toBe(false);
  await cleanupDiagnosticTemporaryDirectories();
  expect(mockFiles.has(`${current.uri}archive.zip`)).toBe(true);
});

test('keeps an upload created while asynchronous startup cleanup is scanning', async () => {
  mockDirectories.add(`${parent}run-${id}/`);
  mockFiles.add(`${parent}run-${id}/abandoned.zip`);
  let resume!: () => void;
  let started!: () => void;
  const scanning = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockReadDirectory.mockImplementationOnce(async (uri) => {
    started();
    await new Promise<void>((resolve) => {
      resume = resolve;
    });
    return mockEntries(uri);
  });
  const cleanup = cleanupDiagnosticTemporaryDirectories();
  await scanning;
  const upload = createDiagnosticTemporaryDirectory('upload');
  mockFiles.add(`${upload.uri}archive.zip`);
  resume();
  await cleanup;
  expect([...mockFiles]).toEqual([`${upload.uri}archive.zip`]);
});
