import type { CallToolResult } from '@modelcontextprotocol/client';

import type { McpAppChannel } from '@/shared/contracts/mcpApp';

import { McpAppRuntime } from '../McpAppRuntime';

const reference = {
  serverId: 'server',
  agentId: 'agent',
  toolName: 'widget',
  resourceUri: 'ui://widget',
  connectionKey: `remote:${'a'.repeat(64)}`,
};
function createHarness() {
  const ports = {
    read: jest.fn(async () => ({
      contents: [
        {
          uri: reference.resourceUri,
          mimeType: 'text/html;profile=mcp-app',
          text: '<p>Widget</p>',
        },
      ],
    })),
    resources: jest.fn(async () => ({ resources: [] })),
    templates: jest.fn(async () => ({ resourceTemplates: [] })),
    tools: jest.fn(async () => [{ name: 'write', inputSchema: { type: 'object' as const } }]),
    call: jest.fn<Promise<CallToolResult>, [unknown, string, Record<string, unknown>, AbortSignal]>(
      async () => ({ content: [{ type: 'text', text: 'done' }] }),
    ),
  };
  const runtime = new McpAppRuntime(ports);
  const responses = new Map<number, (message: Record<string, unknown>) => void>();
  let viewId = '';
  const channel: McpAppChannel = {
    send: (serialized) => {
      const message = JSON.parse(serialized);
      if (message.method === 'ui/resource-teardown') {
        runtime.receive(viewId, JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }));
      } else if ('id' in message && !('method' in message)) {
        responses.get(message.id)?.(message);
        responses.delete(message.id);
      }
    },
    openLink: jest.fn(async () => {}),
    message: jest.fn(async () => {}),
    updateContext: jest.fn(),
    closed: jest.fn(),
  };
  const controller = new AbortController();
  const open = async () => {
    const view = await runtime.open(
      {
        reference,
        input: {},
        result: { content: [] },
        hostContext: {
          theme: 'light',
          locale: 'en-US',
          containerDimensions: { width: 320, height: 600 },
        },
      },
      channel,
      controller.signal,
    );
    viewId = view.id;
    return view;
  };
  const request = (id: number, method: string, params: unknown = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      responses.set(id, resolve);
      runtime.receive(viewId, JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  const initialize = async () => {
    await request(1, 'ui/initialize', {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'Widget', version: '1' },
      appCapabilities: {},
    });
    runtime.receive(
      viewId,
      JSON.stringify({ jsonrpc: '2.0', method: 'ui/notifications/initialized' }),
    );
  };
  return { runtime, ports, channel, controller, open, request, initialize };
}

describe('MCP App session boundaries', () => {
  it('gates tool calls behind initialization, then handles tools/list through the official bridge', async () => {
    const app = createHarness();
    const view = await app.open();
    expect(await app.request(2, 'tools/call', { name: 'write', arguments: {} })).toHaveProperty(
      'error',
    );
    expect(app.ports.call).not.toHaveBeenCalled();
    await app.initialize();
    expect(await app.request(3, 'tools/list')).toMatchObject({
      result: { tools: [{ name: 'write' }] },
    });
    expect(await app.request(4, 'tools/call', { name: 'write', arguments: {} })).toMatchObject({
      result: { content: [{ text: 'done' }] },
    });
    app.runtime.receive(
      view.id,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'write', arguments: {} },
      }),
    );
    await app.request(5, 'ping');
    expect(app.ports.call).toHaveBeenCalledTimes(1);
    await app.runtime.close(view.id);
    expect(app.channel.closed).toHaveBeenCalledTimes(1);
  });

  it('does not forward unsafe links or non-text messages to native capabilities', async () => {
    const app = createHarness();
    const view = await app.open();
    await app.initialize();
    expect(await app.request(2, 'ui/open-link', { url: 'javascript:alert(1)' })).toHaveProperty(
      'error',
    );
    expect(
      await app.request(3, 'ui/message', {
        role: 'user',
        content: [{ type: 'image', mimeType: 'image/png', data: 'eA==' }],
      }),
    ).toHaveProperty('error');
    expect(app.channel.openLink).not.toHaveBeenCalled();
    expect(app.channel.message).not.toHaveBeenCalled();
    await app.runtime.close(view.id);
    app.runtime.receive(
      view.id,
      JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'write' } }),
    );
    expect(app.ports.call).not.toHaveBeenCalled();
  });
});
