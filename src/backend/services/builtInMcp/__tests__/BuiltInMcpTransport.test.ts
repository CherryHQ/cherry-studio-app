import { createMCPClient } from '@ai-sdk/mcp';
import * as z from 'zod';

import { BuiltInMcpTransport } from '../BuiltInMcpTransport';
import { definePluginTool } from '../toolDefinition';

describe('built-in MCP protocol', () => {
  it('negotiates with the real SDK, validates arguments, and reports tool failures', async () => {
    const execute = jest.fn(async ({ city }: { city: string }) => ({ city, temperature: 20 }));
    const transport = new BuiltInMcpTransport('amap', [
      definePluginTool(
        'weather',
        'Read weather',
        z.strictObject({ city: z.string().min(1) }),
        execute,
      ),
    ]);
    const client = await createMCPClient({ transport });
    try {
      expect(client.serverInfo.name).toBe('amap');
      expect((await client.listTools()).tools).toEqual([
        expect.objectContaining({
          name: 'weather',
          annotations: expect.objectContaining({ readOnlyHint: true }),
        }),
      ]);
      const tools = await client.tools();
      const options = { toolCallId: 'call-1', messages: [] };
      await expect(tools.weather.execute?.({ city: '310000' }, options)).resolves.toMatchObject({
        content: [{ type: 'text', text: '{"city":"310000","temperature":20}' }],
      });
      const messages: unknown[] = [];
      const direct = new BuiltInMcpTransport('amap', [
        definePluginTool(
          'weather',
          'Read weather',
          z.strictObject({ city: z.string().min(1) }),
          execute,
        ),
      ]);
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCPTransport exposes callback properties, not EventTarget.
      direct.onmessage = (message) => messages.push(message);
      await direct.send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'weather', arguments: { city: 123 } },
      });
      expect(messages).toEqual([
        expect.objectContaining({ result: expect.objectContaining({ isError: true }) }),
      ]);
      expect(execute).toHaveBeenCalledTimes(1);
      await direct.close();
    } finally {
      await client.close();
    }
  });

  it('cancels active HTTP work when the client is invalidated', async () => {
    let signal: AbortSignal | undefined;
    const transport = new BuiltInMcpTransport('github', [
      definePluginTool('read', 'Read', z.strictObject({}), async (_input, incoming) => {
        signal = incoming;
        return new Promise((_resolve, reject) =>
          incoming.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
        );
      }),
    ]);
    const messages = jest.fn();
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCPTransport exposes callback properties, not EventTarget.
    transport.onmessage = messages;
    const request = transport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'read', arguments: {} },
    });
    await transport.close();
    await expect(request).rejects.toBeDefined();
    expect(signal?.aborted).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it('does not expose tools when the stored authorization is unavailable', async () => {
    const transport = new BuiltInMcpTransport('github', [], async () => {
      throw new Error('Authorization unavailable');
    });
    await expect(createMCPClient({ transport })).rejects.toThrow();
  });
});
