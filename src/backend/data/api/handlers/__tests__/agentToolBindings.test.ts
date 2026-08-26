import type { AgentToolBindingService } from '@/backend/data/services/AgentToolBindingService';

import { createAgentToolBindingHandlers } from '../agentToolBindings';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';
const BINDING_ID = '00000000-0000-4000-8000-000000000002';
const SERVER_ID = '00000000-0000-4000-8000-000000000003';

function createService() {
  return {
    delete: jest.fn(async () => ({ deleted: true as const })),
    list: jest.fn(async () => ({ items: [] })),
    replace: jest.fn(async () => ({ items: [] })),
    upsert: jest.fn(async () => ({})),
  };
}

describe('Agent tool binding handlers', () => {
  it('validates writes, materializes safe MCP defaults, and delegates every endpoint', async () => {
    const service = createService();
    const handlers = createAgentToolBindingHandlers(service as unknown as AgentToolBindingService);

    await handlers['/agents/:agentId/tool-bindings'].GET({ params: { agentId: AGENT_ID } });
    await handlers['/agents/:agentId/tool-bindings'].POST({
      body: { serverId: SERVER_ID, source: 'mcp' },
      params: { agentId: AGENT_ID },
    });
    await handlers['/agents/:agentId/tool-bindings'].PUT({
      body: { bindings: [{ capabilityId: 'calendar.read', source: 'builtin' }] },
      params: { agentId: AGENT_ID },
    });
    await handlers['/agents/:agentId/tool-bindings/:bindingId'].DELETE({
      params: { agentId: AGENT_ID, bindingId: BINDING_ID },
    });

    expect(service.list).toHaveBeenCalledWith(AGENT_ID);
    expect(service.upsert).toHaveBeenCalledWith(AGENT_ID, {
      approval: 'ask',
      enabled: true,
      serverId: SERVER_ID,
      source: 'mcp',
    });
    expect(service.replace).toHaveBeenCalledWith(AGENT_ID, {
      bindings: [
        {
          approval: 'ask',
          capabilityId: 'calendar.read',
          enabled: true,
          source: 'builtin',
        },
      ],
    });
    expect(service.delete).toHaveBeenCalledWith(AGENT_ID, BINDING_ID);
  });

  it('rejects MCP auto approval before calling the service', async () => {
    const service = createService();
    const handlers = createAgentToolBindingHandlers(service as unknown as AgentToolBindingService);

    await expect(
      handlers['/agents/:agentId/tool-bindings'].POST({
        body: { approval: 'auto', serverId: SERVER_ID, source: 'mcp' } as never,
        params: { agentId: AGENT_ID },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(service.upsert).not.toHaveBeenCalled();
  });
});
