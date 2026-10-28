import { resolveSidebarDestination } from '../sidebarDestination';

describe('resolveSidebarDestination', () => {
  test.each([
    ['/agents', 'agents'],
    ['/agents/a1/edit', 'agents'],
    ['/drawings', 'paintings'],
    ['/paintings', 'paintings'],
    ['/plugins/mcp/s1', 'plugins'],
    ['/skills', 'skills'],
    ['/trash', 'library'],
    ['/settings/provider/catalog', 'settings'],
  ] as const)('selects the entry that owns %s', (pathname, destination) => {
    expect(resolveSidebarDestination(pathname)).toBe(destination);
  });

  test('selects nothing for a conversation or an unrelated page', () => {
    for (const pathname of ['/', '/remote', '/agentsx', '/files/f1']) {
      expect(resolveSidebarDestination(pathname)).toBeUndefined();
    }
  });
});
