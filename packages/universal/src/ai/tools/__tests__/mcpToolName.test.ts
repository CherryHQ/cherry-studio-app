import {
  buildFunctionCallToolName,
  buildMcpToolName,
  generateMcpToolFunctionName,
  isFunctionCallToolNameForServer,
  parseFunctionCallToolName,
  toCamelCase,
} from '../mcpToolName';

describe('mcpToolName', () => {
  describe('toCamelCase', () => {
    it('camelCases separators and drops non-ascii', () => {
      expect(toCamelCase('my-server')).toBe('myServer');
      expect(toCamelCase('MY_SERVER')).toBe('myServer');
      expect(toCamelCase('search issues')).toBe('searchIssues');
    });

    it('prefixes an underscore when the result starts with a digit', () => {
      expect(toCamelCase('123tool')).toBe('_123tool');
    });
  });

  describe('buildFunctionCallToolName', () => {
    it('builds mcp__server__tool', () => {
      expect(buildFunctionCallToolName('github', 'search_issues')).toBe(
        'mcp__github__searchIssues',
      );
    });

    it('caps length at 63 and appends a server hash suffix on truncation', () => {
      const longServer = 'a'.repeat(60);
      const name = buildFunctionCallToolName(longServer, 'someToolWithLongName');
      expect(name.length).toBeLessThanOrEqual(63);
    });

    it('distinct long servers do not collide after truncation', () => {
      const toolName = 'search';
      const serverA = `${'x'.repeat(58)}alpha`;
      const serverB = `${'x'.repeat(58)}beta`;
      expect(buildFunctionCallToolName(serverA, toolName)).not.toBe(
        buildFunctionCallToolName(serverB, toolName),
      );
    });

    it('attributes normal and truncated ids to exactly one server', () => {
      const normal = buildFunctionCallToolName('github', 'search_issues');
      expect(isFunctionCallToolNameForServer('github', normal)).toBe(true);
      expect(isFunctionCallToolNameForServer('git', normal)).toBe(false);

      const serverA = `${'a'.repeat(60)}Alpha`;
      const serverB = `${'a'.repeat(60)}Bravo`;
      const truncated = buildFunctionCallToolName(serverA, 'tool');
      expect(isFunctionCallToolNameForServer(serverA, truncated)).toBe(true);
      expect(isFunctionCallToolNameForServer(serverB, truncated)).toBe(false);
    });
  });

  describe('generic MCP names', () => {
    it('supports custom formatting and collision allocation', () => {
      expect(buildMcpToolName('github', 'search_issues')).toBe('github_searchIssues');
      expect(buildMcpToolName('github', 'search', { delimiter: '__', prefix: 'mcp__' })).toBe(
        'mcp__github__search',
      );

      const existingNames = new Set<string>();
      expect(generateMcpToolFunctionName('github', 'search', existingNames)).toBe('github_search');
      expect(generateMcpToolFunctionName('github', 'search', existingNames)).toBe('github_search1');
    });

    it('keeps collision suffixes inside maxLength', () => {
      const existingNames = new Set(['abcd', 'abc1', 'abc2']);
      expect(buildMcpToolName('abcd', '', { existingNames, maxLength: 4 })).toBe('abc3');
    });
  });

  describe('parseFunctionCallToolName', () => {
    it('round-trips a built name', () => {
      const name = buildFunctionCallToolName('github', 'search_issues');
      expect(parseFunctionCallToolName(name)).toEqual({
        serverPart: 'github',
        toolPart: 'searchIssues',
      });
    });

    it('returns null for non-mcp names', () => {
      expect(parseFunctionCallToolName('web_search')).toBeNull();
      expect(parseFunctionCallToolName('mcp__onlyserver')).toBeNull();
    });
  });
});
