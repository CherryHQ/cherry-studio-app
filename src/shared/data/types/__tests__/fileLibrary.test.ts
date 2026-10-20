import { fileNameKey, workspacePathSegments } from '../fileLibrary';

describe('workspace paths', () => {
  it('normalizes relative traversal without leaving the workspace', () => {
    expect(workspacePathSegments('./Reports/old/../Draft.md')).toEqual(['Reports', 'Draft.md']);
    expect(workspacePathSegments('.')).toEqual([]);
    expect(fileNameKey('CAFE\u0301.md')).toBe(fileNameKey('café.md'));
  });
  it.each([
    '/tmp/secret',
    '../secret',
    'one/../../secret',
    'C:\\secret',
    'file:secret',
    'one\\two',
    'a\0b',
  ])('rejects %s', (path) => {
    expect(() => workspacePathSegments(path)).toThrow();
  });
});
