import type { McpPromptEntry } from '@/shared/contracts/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { RemoteMcpServer } from '@/shared/data/types/mcpServer';

import { getChatInputMcpPrompts } from '../chatInputMcpPrompts';

const server: RemoteMcpServer = {
  id: 'server-1',
  name: 'Workspace',
  endpointUrl: 'https://example.com/mcp',
  isEnabled: true,
  disabledTools: [],
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};
const binding: AgentToolBinding = {
  id: 'binding-1',
  agentId: 'agent-1',
  serverId: server.id,
  source: 'mcp',
  enabled: true,
  approval: 'ask',
  displayNameSnapshot: server.name,
  createdAt: server.createdAt,
  updatedAt: server.updatedAt,
};
const prompt: McpPromptEntry = {
  kind: 'prompt',
  key: 'review',
  title: 'Review changes',
  arguments: [],
};
const catalogs = { [server.id]: [prompt] };

it('offers only cached prompts from servers enabled for the current Agent', () => {
  expect(getChatInputMcpPrompts([server], [binding], catalogs)).toEqual([
    { serverId: server.id, serverName: server.name, prompt },
  ]);
  expect(getChatInputMcpPrompts([server], [], catalogs)).toEqual([]);
  expect(getChatInputMcpPrompts([server], [binding], {})).toEqual([]);
  expect(getChatInputMcpPrompts([server], [binding], { [server.id]: [] })).toEqual([]);
});

it.each([{ enabled: false }, { approval: 'deny' as const }, { rawToolName: 'search' }])(
  'does not treat an inactive or per-tool binding as server enablement: %o',
  (patch) => {
    expect(getChatInputMcpPrompts([server], [{ ...binding, ...patch }], catalogs)).toEqual([]);
  },
);

it('hides cached metadata after global disable or server removal', () => {
  expect(getChatInputMcpPrompts([{ ...server, isEnabled: false }], [binding], catalogs)).toEqual(
    [],
  );
  expect(getChatInputMcpPrompts([], [binding], catalogs)).toEqual([]);
});
