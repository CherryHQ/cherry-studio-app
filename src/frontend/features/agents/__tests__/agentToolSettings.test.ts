import type { PermissionStatuses } from '@/shared/contracts';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';

import {
  type AgentBuiltInToolOption,
  buildAgentBuiltInToolOptions,
  buildAgentMcpServerOptions,
  createAgentToolBindingDraft,
  getAgentMcpToolBindingStatus,
  type McpToolBindingDraft,
  setAgentBuiltInToolEnabled,
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

describe('buildAgentBuiltInToolOptions', () => {
  test('enables the catalog defaults and leaves web search opt-in', () => {
    const options = build({});

    expect(statusOf(options, 'write_file')).toBe('available');
    expect(statusOf(options, 'web_search')).toBe('binding-disabled');
  });

  test('reports what is blocking an unavailable capability', () => {
    const options = build({});

    expect(statusOf(options, 'calendar_list_events')).toBe('needs-permission');
    expect(statusOf(options, 'generate_image')).toBe('needs-painting-model');
    expect(supportedOf(options, 'calendar_list_events')).toBe(false);
  });

  test('marks iOS-only capabilities unsupported on Android', () => {
    const options = build({
      permissionStatuses: { 'reminders.read': 'granted' },
      platform: 'android',
    });

    expect(statusOf(options, 'reminder_list_items')).toBe('unsupported');
  });

  test('becomes available once its permission is granted', () => {
    const options = build({ permissionStatuses: { 'calendar.read': 'granted' } });

    expect(statusOf(options, 'calendar_list_events')).toBe('available');
    expect(supportedOf(options, 'calendar_list_events')).toBe(true);
  });

  test('follows an explicit binding over the catalog default', () => {
    const off = build({
      bindings: [
        { approval: 'auto', capabilityId: 'write_file', enabled: false, source: 'builtin' },
      ],
    });
    expect(statusOf(off, 'write_file')).toBe('binding-disabled');

    const on = build({
      bindings: [
        { approval: 'auto', capabilityId: 'web_search', enabled: true, source: 'builtin' },
      ],
    });
    expect(statusOf(on, 'web_search')).toBe('available');
  });
});

describe('setAgentBuiltInToolEnabled', () => {
  test('writes an explicit binding carrying the catalog approval', () => {
    const options = build({});
    const option = optionFor(options, 'web_search');

    const next = setAgentBuiltInToolEnabled([], option, true);

    expect(next).toEqual([
      { approval: 'auto', capabilityId: 'web_search', enabled: true, source: 'builtin' },
    ]);
  });

  test('records a disabled default rather than dropping the row', () => {
    // Deleting it would let a later catalog-default change silently re-enable
    // a capability the user turned off.
    const options = build({});
    const option = optionFor(options, 'write_file');

    const next = setAgentBuiltInToolEnabled([], option, false);

    expect(next).toEqual([
      { approval: 'auto', capabilityId: 'write_file', enabled: false, source: 'builtin' },
    ]);
  });

  test('replaces the existing binding instead of duplicating it', () => {
    const existing: WriteAgentToolBinding[] = [
      { approval: 'ask', capabilityId: 'web_search', enabled: true, source: 'builtin' },
    ];
    const option = optionFor(build({ bindings: existing }), 'web_search');

    const next = setAgentBuiltInToolEnabled(existing, option, false);

    expect(next).toEqual([
      // The user's approval choice survives the switch.
      { approval: 'ask', capabilityId: 'web_search', enabled: false, source: 'builtin' },
    ]);
  });

  test('leaves MCP bindings untouched', () => {
    const mcp: WriteAgentToolBinding = {
      approval: 'ask',
      enabled: true,
      serverId: '00000000-0000-4000-8000-00000000000a',
      source: 'mcp',
    };
    const option = optionFor(build({}), 'web_search');

    expect(setAgentBuiltInToolEnabled([mcp], option, true)).toContainEqual(mcp);
  });
});

function build(input: {
  bindings?: WriteAgentToolBinding[];
  permissionStatuses?: PermissionStatuses;
  platform?: string;
}) {
  return buildAgentBuiltInToolOptions({
    bindings: input.bindings ?? [],
    hasPaintingModel: false,
    permissionStatuses: input.permissionStatuses ?? {},
    platform: input.platform ?? 'ios',
  });
}

function optionFor(options: AgentBuiltInToolOption[], capabilityId: string) {
  const option = options.find((candidate) => candidate.descriptor.capabilityId === capabilityId);
  if (!option) {
    throw new Error(`Missing built-in tool option: ${capabilityId}`);
  }
  return option;
}

function statusOf(options: AgentBuiltInToolOption[], capabilityId: string) {
  return optionFor(options, capabilityId).status;
}

function supportedOf(options: AgentBuiltInToolOption[], capabilityId: string) {
  return optionFor(options, capabilityId).isSupported;
}
