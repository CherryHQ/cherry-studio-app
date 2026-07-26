import type { Assistant, McpMode } from '@/data/types/assistant';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import type { McpServer } from '@/data/types/mcpServer';
import { getEffectiveMcpMode, resolveServersForAssistant } from '../resolveAssistantMcpServers';

function makeAssistant(overrides: { mcpMode?: McpMode; mcpServerIds?: string[] }): Assistant {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    emoji: '🌟',
    id: '00000000-0000-4000-8000-000000000000',
    knowledgeBaseIds: [],
    mcpServerIds: overrides.mcpServerIds ?? [],
    modelId: null,
    modelName: null,
    name: 'A',
    orderKey: 'a0',
    prompt: '',
    settings: {
      ...DEFAULT_ASSISTANT_SETTINGS,
      ...(overrides.mcpMode ? { mcpMode: overrides.mcpMode } : {}),
    },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeServer(id: string): McpServer {
  return {
    baseUrl: `https://${id}.example/mcp`,
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools: [],
    headers: {},
    id,
    isActive: true,
    name: id,
    timeout: null,
    type: 'streamableHttp',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const activeServers = [makeServer('a'), makeServer('b'), makeServer('c')];

describe('getEffectiveMcpMode', () => {
  it('honors an explicit mode', () => {
    expect(getEffectiveMcpMode(makeAssistant({ mcpMode: 'disabled' }))).toBe('disabled');
    expect(getEffectiveMcpMode(makeAssistant({ mcpMode: 'auto' }))).toBe('auto');
  });

  it('falls back to manual when servers are selected and no explicit mode', () => {
    const assistant = makeAssistant({ mcpServerIds: ['a'] });
    // DEFAULT_ASSISTANT_SETTINGS.mcpMode is 'auto', so simulate an absent mode.
    assistant.settings.mcpMode = undefined as unknown as McpMode;
    expect(getEffectiveMcpMode(assistant)).toBe('manual');
  });

  it('falls back to disabled with no servers and no explicit mode', () => {
    const assistant = makeAssistant({});
    assistant.settings.mcpMode = undefined as unknown as McpMode;
    expect(getEffectiveMcpMode(assistant)).toBe('disabled');
  });
});

describe('resolveServersForAssistant', () => {
  it('returns all active servers in auto mode', () => {
    const result = resolveServersForAssistant(makeAssistant({ mcpMode: 'auto' }), activeServers);
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing in disabled mode', () => {
    expect(
      resolveServersForAssistant(makeAssistant({ mcpMode: 'disabled' }), activeServers),
    ).toEqual([]);
  });

  it('intersects selected ids in manual mode and ignores dangling ids', () => {
    const result = resolveServersForAssistant(
      makeAssistant({ mcpMode: 'manual', mcpServerIds: ['b', 'deleted-server'] }),
      activeServers,
    );
    expect(result.map((s) => s.id)).toEqual(['b']);
  });
});
