import { buildFunctionCallToolName, parseFunctionCallToolName, toCamelCase } from '../mcpToolName';

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
