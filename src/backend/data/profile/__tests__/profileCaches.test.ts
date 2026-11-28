import { resetProfileCaches } from '../profileCaches';

const mockExistingPaths = new Set([
  'file:///cache/ModelImages',
  'file:///cache/ImageEdits',
  'file:///cache/mcp-00000000-0000-0000-0000-000000000001',
  'file:///cache/keep-unrelated',
]);
const mockDeletedPaths: string[] = [];

jest.mock('expo-file-system', () => ({
  Paths: {
    cache: {
      uri: 'file:///cache',
      list: () =>
        [...mockExistingPaths].map((uri) => ({
          name: uri.slice('file:///cache/'.length),
          delete: () => {
            mockExistingPaths.delete(uri);
            mockDeletedPaths.push(uri);
          },
        })),
    },
  },
  Directory: class {
    readonly uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return mockExistingPaths.has(this.uri);
    }
    delete() {
      mockExistingPaths.delete(this.uri);
      mockDeletedPaths.push(this.uri);
    }
  },
}));

describe('resetProfileCaches', () => {
  test('cleans ModelImages alongside other disposable profile cache directories', () => {
    resetProfileCaches();

    expect(mockDeletedPaths).toEqual([
      'file:///cache/ImageEdits',
      'file:///cache/ModelImages',
      'file:///cache/mcp-00000000-0000-0000-0000-000000000001',
    ]);
    expect(mockExistingPaths.has('file:///cache/keep-unrelated')).toBe(true);
  });
});
