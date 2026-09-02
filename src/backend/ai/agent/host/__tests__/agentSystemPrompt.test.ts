import type { RuntimeTool } from '../../runtime';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';

function tool(capabilityId: string, providerName = capabilityId): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId },
    providerName,
    displayName: capabilityId,
    description: '',
    inputSchema: {},
    approval: 'auto',
    execute: async () => ({ value: null, artifacts: [] }),
  };
}

function mcpTool(approval: RuntimeTool['approval'] = 'auto'): RuntimeTool {
  return {
    ...tool('irrelevant', 'mcp_server_1_lookup_a1b2'),
    ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'lookup' },
    approval,
  };
}

describe('buildAgentSystemPrompt', () => {
  test('keeps the mobile Runtime rules when the Agent has no configured instructions or tools', () => {
    const prompt = buildAgentSystemPrompt({ agentInstructions: '   ', tools: [] });

    expect(prompt).toContain('# Cherry Studio Mobile Runtime');
    expect(prompt).toContain('Treat the tools exposed for this turn as the complete');
    expect(prompt).toContain('carry it through the necessary tool steps');
    expect(prompt).toContain('persistent memory, or background execution');
    expect(prompt).not.toContain('## Agent Instructions');
    expect(prompt).not.toContain('## MCP Tool Discovery');
    expect(prompt).not.toContain('## Web Citations');
    expect(prompt).not.toContain('## Managed Files');
  });

  test('preserves user-configured Agent instructions behind the platform rules', () => {
    const prompt = buildAgentSystemPrompt({
      agentInstructions: 'Be a playful travel planner.\nAlways propose two options.',
      tools: [],
    });

    expect(prompt).toContain(
      '<agent_instructions>\nBe a playful travel planner.\nAlways propose two options.\n</agent_instructions>',
    );
    expect(prompt.indexOf('## Runtime Rules')).toBeLessThan(
      prompt.indexOf('## Agent Instructions'),
    );
  });

  test('adds citation rules only for citable built-in web tools', () => {
    const withWeb = buildAgentSystemPrompt({
      agentInstructions: '',
      tools: [tool('web_search', 'mobile_web_search')],
    });
    const withMcp = buildAgentSystemPrompt({
      agentInstructions: '',
      tools: [mcpTool()],
    });

    expect(withWeb).toContain('## Web Citations');
    expect(withWeb).toContain('`mobile_web_search`');
    expect(withWeb).toContain('[cite:ID]');
    expect(withMcp).not.toContain('## Web Citations');
  });

  test('adds managed-file rules only when a managed-file tool is available', () => {
    const withFile = buildAgentSystemPrompt({
      agentInstructions: '',
      tools: [tool('write_file')],
    });
    const withoutFile = buildAgentSystemPrompt({
      agentInstructions: '',
      tools: [tool('calendar_list_events')],
    });

    expect(withFile).toContain('## Managed Files');
    expect(withFile).toContain('never invent an absolute path');
    expect(withoutFile).not.toContain('## Managed Files');
  });

  test('adds MCP catalog guidance only when an executable MCP tool is available', () => {
    const withMcp = buildAgentSystemPrompt({ agentInstructions: '', tools: [mcpTool()] });
    const withDeniedMcp = buildAgentSystemPrompt({
      agentInstructions: '',
      tools: [mcpTool('deny')],
    });

    expect(withMcp).toContain('## MCP Tool Discovery');
    expect(withMcp).toContain('Use `tool_search` only for tool discovery');
    expect(withMcp).toContain('Use `tool_call` with an exact discovered name');
    expect(withDeniedMcp).not.toContain('## MCP Tool Discovery');
  });
});
