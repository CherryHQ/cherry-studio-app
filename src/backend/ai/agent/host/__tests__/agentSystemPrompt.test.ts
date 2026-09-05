import type { RuntimeTool } from '../../runtime';
import { buildAgentSystemPrompt, resolveAgentAppLanguage } from '../agentSystemPrompt';

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

function mcpTool(): RuntimeTool {
  return {
    ...tool('irrelevant', 'mcp_server_1_lookup_a1b2'),
    ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'lookup' },
  };
}

describe('buildAgentSystemPrompt', () => {
  test('keeps the mobile Runtime rules when the Agent has no configured instructions or tools', () => {
    const prompt = buildAgentSystemPrompt({
      agentInstructions: '   ',
      appLanguage: 'zh-CN',
      currentDate: '2026-09-03',
      tools: [],
    });

    expect(prompt).toContain('# Cherry Studio Mobile Runtime');
    expect(prompt).toContain('Treat the tools exposed for this turn as the complete');
    expect(prompt).toContain('carry it through the necessary tool steps');
    expect(prompt).toContain('persistent memory, or background execution');
    expect(prompt).toContain('The current Cherry Studio App language is `zh-CN`.');
    expect(prompt).toContain('The current local date is `2026-09-03`.');
    expect(prompt).toContain('You must write every response in this language');
    expect(prompt).not.toContain('## Agent Instructions');
    expect(prompt).not.toContain('## MCP Tool Discovery');
    expect(prompt).not.toContain('## Web Citations');
    expect(prompt).not.toContain('## Managed Files');
  });

  test('preserves user-configured Agent instructions behind the platform rules', () => {
    const prompt = buildAgentSystemPrompt({
      agentInstructions: 'Be a playful travel planner.\nAlways propose two options.',
      appLanguage: 'en-US',
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
      appLanguage: 'en-US',
      tools: [tool('web_search', 'mobile_web_search')],
    });
    const withMcp = buildAgentSystemPrompt({
      agentInstructions: '',
      appLanguage: 'en-US',
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
      appLanguage: 'en-US',
      tools: [tool('edit_file'), tool('write_file')],
    });
    const withoutFile = buildAgentSystemPrompt({
      agentInstructions: '',
      appLanguage: 'en-US',
      tools: [tool('calendar_list_events')],
    });

    expect(withFile).toContain('## Managed Files');
    expect(withFile).toContain('only when the user explicitly asks');
    expect(withFile).toContain('otherwise provide the requested answer');
    expect(withFile).toContain('never invent an absolute path');
    expect(withFile).toContain('call `edit_file` with its `file_entry_id`');
    expect(withFile).toContain('do not create a replacement with `write_file`');
    expect(withoutFile).not.toContain('## Managed Files');
  });

  test('leaves MCP catalog guidance to the Runtime binding', () => {
    const withMcp = buildAgentSystemPrompt({
      agentInstructions: '',
      appLanguage: 'en-US',
      tools: [mcpTool()],
    });

    expect(withMcp).not.toContain('## MCP Tool Discovery');
    expect(withMcp).not.toContain('tool_search');
    expect(withMcp).not.toContain('tool_call');
  });

  test('resolves the effective App language from preferences before the device fallback', () => {
    expect(resolveAgentAppLanguage('ja-JP', 'zh')).toBe('ja-JP');
    expect(resolveAgentAppLanguage(null, 'zh')).toBe('zh-CN');
    expect(resolveAgentAppLanguage(null, 'en')).toBe('en-US');
  });
});
