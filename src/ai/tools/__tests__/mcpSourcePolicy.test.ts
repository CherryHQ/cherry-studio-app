import type { McpServer } from '@/data/types/mcpServer';
import {
  buildMcpWireToolId,
  buildMcpWireWildcard,
  hasMcpServerWildcardRule,
  isMcpToolDisabledBySource,
  isMcpToolForcePromptBySource,
  withMcpToolRuleAdded,
  withMcpToolRuleCleared,
} from '../mcpSourcePolicy';

function makeServer(disabledTools: string[], disabledAutoApproveTools: string[] = []): McpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools,
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

describe('hasMcpServerWildcardRule', () => {
  it('only fires on the wildcard, the one rule that covers unnamed tools', () => {
    const server = makeServer([]);
    expect(hasMcpServerWildcardRule(['mcp__myServer__*'], server)).toBe(true);
    // Both name a single tool, so clearing them needs no tool list.
    expect(hasMcpServerWildcardRule(['search', 'mcp__myServer__search'], server)).toBe(false);
    expect(hasMcpServerWildcardRule([], server)).toBe(false);
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

describe('isMcpToolForcePromptBySource', () => {
  it('defaults to auto-approval when the list is empty', () => {
    expect(isMcpToolForcePromptBySource(makeServer([]), { name: 'search' })).toBe(false);
  });

  it('prompts for tools matched by raw name, wire id, or wildcard', () => {
    expect(isMcpToolForcePromptBySource(makeServer([], ['search']), { name: 'search' })).toBe(true);
    expect(
      isMcpToolForcePromptBySource(makeServer([], ['mcp__myServer__searchIssues']), {
        name: 'search_issues',
      }),
    ).toBe(true);
    expect(
      isMcpToolForcePromptBySource(makeServer([], ['mcp__myServer__*']), { name: 'anything' }),
    ).toBe(true);
  });

  it('is independent of disabledTools', () => {
    // A disabled tool never runs at all — the two lists must not bleed into
    // each other's semantics.
    expect(isMcpToolForcePromptBySource(makeServer(['search']), { name: 'search' })).toBe(false);
    expect(isMcpToolDisabledBySource(makeServer([], ['search']), { name: 'search' })).toBe(false);
  });
});

describe('toggling one tool', () => {
  const knownTools = ['search', 'create', 'delete'];

  it('drops every rule form that targeted the tool', () => {
    const server = makeServer(['search', 'mcp__myServer__search', 'other']);

    expect(withMcpToolRuleCleared(server.disabledTools, server, 'search', knownTools)).toEqual([
      'other',
    ]);
  });

  it('expands a server wildcard so the other tools stay disabled', () => {
    const server = makeServer(['mcp__myServer__*']);

    // Filtering the wildcard out wholesale would enable every tool at once.
    expect(
      withMcpToolRuleCleared(server.disabledTools, server, 'search', knownTools).sort(),
    ).toEqual(['create', 'delete']);
    expect(isMcpToolDisabledBySource(makeServer(['create', 'delete']), { name: 'search' })).toBe(
      false,
    );
  });

  it('is a no-op when the tool was already enabled', () => {
    const server = makeServer(['other']);
    expect(withMcpToolRuleCleared(server.disabledTools, server, 'search', knownTools)).toEqual([
      'other',
    ]);
  });

  it('disables by raw name without duplicating an existing entry', () => {
    expect(withMcpToolRuleAdded([], 'search')).toEqual(['search']);
    expect(withMcpToolRuleAdded(['search'], 'search')).toEqual(['search']);
  });

  it('applies the same clearing rules to any list, e.g. disabledAutoApproveTools', () => {
    const server = makeServer([], ['mcp__myServer__*']);

    // Turning auto-approve back on for one tool must not auto-approve the lot.
    expect(
      withMcpToolRuleCleared(server.disabledAutoApproveTools, server, 'search', knownTools).sort(),
    ).toEqual(['create', 'delete']);
    expect(withMcpToolRuleAdded(['create'], 'search').sort()).toEqual(['create', 'search']);
    expect(withMcpToolRuleAdded(['search'], 'search')).toEqual(['search']);
  });
});
