import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  buildAgentMcpServerOptions,
  createAgentToolBindingDraft,
  getAgentMcpToolBindingStatus,
  type McpToolBindingDraft,
  setAgentMcpServerEnabled,
} from '../agentToolSettings';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';
const HTTP_ID = '00000000-0000-4000-8000-000000000002';
const SAME_NAME_ID = '00000000-0000-4000-8000-000000000003';
const UNSUPPORTED_ID = '00000000-0000-4000-8000-000000000004';
const DELETED_ID = '00000000-0000-4000-8000-000000000005';

describe('agent tool settings', () => {
  it('keys duplicate display names by server id and excludes unbound unsupported servers', () => {
    const bindings = [makeStoredMcpBinding(UNSUPPORTED_ID), makeStoredMcpBinding(DELETED_ID)];
    const draft = createAgentToolBindingDraft(bindings);
    const options = buildAgentMcpServerOptions({
      bindings: draft,
      originalBindings: bindings,
      servers: [
        makeServer(HTTP_ID, 'Same name', 'https://one.example/mcp'),
        makeServer(SAME_NAME_ID, 'Same name', 'https://two.example/mcp'),
        makeServer(UNSUPPORTED_ID, 'Legacy', 'file:///legacy'),
        makeServer('00000000-0000-4000-8000-000000000006', 'Hidden', 'file:///hidden'),
      ],
    });

    expect(options.map((option) => option.serverId)).toEqual([
      HTTP_ID,
      SAME_NAME_ID,
      UNSUPPORTED_ID,
      DELETED_ID,
    ]);
    expect(options.map((option) => option.status)).toEqual([
      'available',
      'available',
      'unsupported',
      'deleted',
    ]);
  });

  it('adds a server-default binding with ask approval without changing other identities', () => {
    const builtin: WriteAgentToolBinding = {
      approval: 'auto',
      capabilityId: 'calendar.read',
      enabled: true,
      source: 'builtin',
    };
    const toolBinding: WriteAgentToolBinding = {
      approval: 'deny',
      enabled: true,
      rawToolName: 'search',
      serverId: HTTP_ID,
      source: 'mcp',
    };
    const [option] = buildAgentMcpServerOptions({
      bindings: [builtin, toolBinding],
      originalBindings: [],
      servers: [makeServer(HTTP_ID, 'Search', 'https://example.com/mcp')],
    });

    const selected = setAgentMcpServerEnabled([builtin, toolBinding], option, true);

    expect(selected).toEqual([
      builtin,
      toolBinding,
      {
        approval: 'ask',
        displayNameSnapshot: 'Search',
        enabled: true,
        serverId: HTTP_ID,
        source: 'mcp',
      },
    ]);
    const selectedServerBinding = selected.find(
      (binding): binding is McpToolBindingDraft =>
        binding.source === 'mcp' && binding.rawToolName === undefined,
    );
    expect(selectedServerBinding).toBeDefined();
    expect(
      setAgentMcpServerEnabled(selected, { ...option, binding: selectedServerBinding }, false),
    ).toEqual([builtin, toolBinding]);
  });

  it('distinguishes globally disabled and missing discovered tools', () => {
    const binding = {
      approval: 'ask',
      enabled: true,
      rawToolName: 'search',
      serverId: HTTP_ID,
      source: 'mcp',
    } as const;
    const server = makeServer(HTTP_ID, 'Search', 'https://example.com/mcp');

    expect(
      getAgentMcpToolBindingStatus({
        binding,
        catalog: { names: new Set(), state: 'ready' },
        server,
      }),
    ).toBe('tool-unavailable');
    expect(
      getAgentMcpToolBindingStatus({
        binding,
        catalog: { names: new Set(['search']), state: 'ready' },
        server: { ...server, disabledTools: ['search'] },
      }),
    ).toBe('tool-disabled');
  });
});

function makeStoredMcpBinding(serverId: string): AgentToolBinding {
  return {
    agentId: AGENT_ID,
    approval: 'ask',
    createdAt: '2026-08-26T00:00:00.000Z',
    displayNameSnapshot: `Server ${serverId}`,
    enabled: true,
    id: serverId,
    serverId,
    source: 'mcp',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
}

function makeServer(id: string, name: string, endpointUrl: string): McpServer {
  return {
    createdAt: '2026-08-26T00:00:00.000Z',
    disabledTools: [],
    endpointUrl,
    id,
    isEnabled: true,
    name,
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
}
