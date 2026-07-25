import type { McpServer } from '@/data/types/mcpServer';
import {
  buildMcpWireToolId,
  buildMcpWireWildcard,
  isMcpToolDisabledBySource,
} from '../mcpSourcePolicy';

function makeServer(disabledTools: string[]): McpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools,
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'My Server',
    timeout: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('mcp wire identifiers', () => {
  it('builds the wire id and wildcard from the camelCased server name', () => {
    expect(buildMcpWireToolId('My Server', 'search_issues')).toBe('mcp__myServer__searchIssues');
    expect(buildMcpWireWildcard('My Server')).toBe('mcp__myServer__*');
  });
});

describe('isMcpToolDisabledBySource', () => {
  it('matches a raw tool name', () => {
    expect(isMcpToolDisabledBySource(makeServer(['search']), { name: 'search' })).toBe(true);
  });

  it('matches a minted tool id', () => {
    const server = makeServer(['mcp__myServer__search']);
    expect(isMcpToolDisabledBySource(server, { id: 'mcp__myServer__search', name: 'x' })).toBe(
      true,
    );
  });

  it('matches a wire id derived from the server name', () => {
    const server = makeServer(['mcp__myServer__searchIssues']);
    expect(isMcpToolDisabledBySource(server, { name: 'search_issues' })).toBe(true);
  });

  it('matches a server-wide wildcard', () => {
    const server = makeServer(['mcp__myServer__*']);
    expect(isMcpToolDisabledBySource(server, { name: 'anything' })).toBe(true);
  });

  it('does not match another server wildcard or an unrelated tool', () => {
    expect(isMcpToolDisabledBySource(makeServer(['mcp__other__*']), { name: 'search' })).toBe(
      false,
    );
    expect(isMcpToolDisabledBySource(makeServer(['other']), { name: 'search' })).toBe(false);
    expect(isMcpToolDisabledBySource(makeServer([]), { name: 'search' })).toBe(false);
  });
});
