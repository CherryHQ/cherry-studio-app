import { TRACE_RETENTION, traceFileStorage } from '../traceFileStorage';

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return {
    randomUUID: () => `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, '0')}`,
  };
});

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Map<string, string>();
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/+$/, '')).join('/');
  class MockDirectory {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = `${join(parts)}/`;
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      directories.add(this.uri);
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(this.uri))
        .map((uri) => new MockFile(uri));
    }
    delete() {
      directories.delete(this.uri);
      for (const uri of files.keys()) if (uri.startsWith(this.uri)) files.delete(uri);
    }
  }
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get size() {
      return new TextEncoder().encode(files.get(this.uri) ?? '').byteLength;
    }
    create() {
      files.set(this.uri, '');
    }
    write(content: string) {
      files.set(this.uri, content);
    }
    delete() {
      files.delete(this.uri);
    }
    move(destination: MockFile) {
      files.set(destination.uri, files.get(this.uri)!);
      files.delete(this.uri);
      // Expo updates the source object's URI, so cleanup must not delete the committed file.
      this.uri = destination.uri;
    }
    copy(destination: MockFile) {
      files.set(destination.uri, files.get(this.uri)!);
    }
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: 'file:///documents', cache: 'file:///cache' },
    testState: { directories, files },
  };
});

const { testState } = jest.requireMock<{
  testState: { directories: Set<string>; files: Map<string, string> };
}>('expo-file-system');
const directory = 'file:///documents/Runtime/trace/v1/';
const now = 2_000_000_000_000;
const diagnostics = { droppedRecords: 0, writeFailures: 0 };
const name = (timestamp: number, index = 1) =>
  `${timestamp}-00000000-0000-4000-8000-${index.toString().padStart(12, '0')}.jsonl`;

beforeEach(() => {
  testState.directories.clear();
  testState.files.clear();
});

describe('traceFileStorage', () => {
  it('keeps the committed JSONL batch after the native move mutates the source URI', async () => {
    await traceFileStorage.writeBatch(['{"revision":1}', '{"revision":2}'], now);
    expect([...testState.files.values()]).toEqual(['{"revision":1}\n{"revision":2}\n']);
    expect([...testState.files.keys()][0]).toMatch(/\.jsonl$/);
  });

  it('prunes only owned temporary and expired batches and enforces the file-count limit', async () => {
    testState.directories.add(directory);
    testState.files.set(`${directory}${name(now - TRACE_RETENTION.maxAgeMs - 1)}`, 'expired');
    testState.files.set(`${directory}${name(now)}.tmp`, 'incomplete');
    testState.files.set(`${directory}unrelated.txt`, 'keep');
    for (let index = 0; index <= TRACE_RETENTION.maxFiles; index += 1) {
      testState.files.set(`${directory}${name(now - index, index)}`, 'current');
    }
    await traceFileStorage.prune(now);
    expect(testState.files.size).toBe(TRACE_RETENTION.maxFiles + 1);
    expect([...testState.files.values()]).not.toContain('expired');
    expect([...testState.files.values()]).not.toContain('incomplete');
    expect(testState.files.get(`${directory}unrelated.txt`)).toBe('keep');
    expect(
      testState.files.has(
        `${directory}${name(now - TRACE_RETENTION.maxFiles, TRACE_RETENTION.maxFiles)}`,
      ),
    ).toBe(false);
  });

  it('keeps the newest files within the byte limit', async () => {
    testState.directories.add(directory);
    testState.files.set(`${directory}${name(now)}`, 'a'.repeat(TRACE_RETENTION.maxBytes));
    testState.files.set(`${directory}${name(now - 1)}`, 'older');
    await traceFileStorage.prune(now);
    expect([...testState.files.keys()]).toEqual([`${directory}${name(now)}`]);
  });

  it('returns independent copies plus a manifest that remain stable after source retention', async () => {
    await traceFileStorage.writeBatch(['{"revision":1}'], now);
    const snapshot = await traceFileStorage.snapshot(now, diagnostics);
    const batch = snapshot.files.find((file) => file.name.endsWith('.jsonl'))!;
    const manifest = snapshot.files.find((file) => file.name === 'manifest.json')!;
    expect(JSON.parse(testState.files.get(manifest.uri)!)).toMatchObject({
      schemaVersion: 1,
      capture: 'metadata',
      diagnostics,
      files: [{ name: batch.name, size: batch.size }],
    });
    await traceFileStorage.prune(now + TRACE_RETENTION.maxAgeMs + 1);
    expect(testState.files.get(batch.uri)).toBe('{"revision":1}\n');
    snapshot.dispose();
    snapshot.dispose();
    expect(testState.files.size).toBe(0);
  });
});
