import { McpElicitationBroker } from '../mcpElicitation';

const source = {
  serverId: 'server',
  serverName: 'Service',
  endpointUrl: 'https://mcp.example/mcp',
};
const form = {
  mode: 'form',
  message: 'Choose a name',
  requestedSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 2 } },
    required: ['name'],
  },
};

describe('MCP elicitation ownership', () => {
  it('rejects invalid answers and only resolves after valid explicit submission', async () => {
    const broker = new McpElicitationBroker();
    const result = broker.request(source, form, new AbortController().signal);
    const id = broker.getSnapshot()[0]!.id;
    expect(() => broker.respond(id, { action: 'accept', content: { name: '' } })).toThrow();
    expect(broker.getSnapshot()).toHaveLength(1);
    broker.respond(id, { action: 'accept', content: { name: 'Cherry' } });
    await expect(result).resolves.toEqual({ action: 'accept', content: { name: 'Cherry' } });
    expect(broker.getSnapshot()).toEqual([]);
  });

  it('cancels on the initiating call abort and rejects late submissions', async () => {
    const broker = new McpElicitationBroker();
    const controller = new AbortController();
    const result = broker.request(source, form, controller.signal);
    const id = broker.getSnapshot()[0]!.id;
    controller.abort();
    await expect(result).resolves.toEqual({ action: 'cancel' });
    expect(broker.getSnapshot()).toEqual([]);
    expect(() => broker.respond(id, { action: 'accept', content: { name: 'late' } })).toThrow();
  });

  it('never presents a non-HTTPS URL or credentials embedded in a URL', async () => {
    const broker = new McpElicitationBroker();
    for (const url of ['javascript:alert(1)', 'http://example.com', 'https://secret@example.com']) {
      await expect(
        broker.request(
          source,
          { mode: 'url', message: 'Visit', url },
          new AbortController().signal,
        ),
      ).resolves.toEqual({ action: 'cancel' });
    }
    expect(broker.getSnapshot()).toEqual([]);
  });
});
