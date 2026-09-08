import type { JSONRPCMessage, MCPTransport, MCPTransportSendOptions } from '@ai-sdk/mcp';
import * as z from 'zod';

import type { PluginTool } from './toolDefinition';

/** An in-process MCP transport; the SDK still owns protocol and tool-call semantics. */
export class BuiltInMcpTransport implements MCPTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private closed = false;
  private readonly active = new Map<string | number, AbortController>();

  constructor(
    private readonly name: string,
    private readonly tools: PluginTool[],
    private readonly verifyAuthorization?: () => Promise<void>,
  ) {}

  async start() {
    await this.verifyAuthorization?.();
    if (this.closed) throw new Error('Plugin transport is closed.');
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.active.values()) request.abort();
    this.active.clear();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage, options?: MCPTransportSendOptions): Promise<void> {
    if (this.closed) throw new Error('Plugin transport is closed.');
    if (!('method' in message)) return;
    if (!('id' in message)) {
      if (message.method === 'notifications/cancelled') {
        const requestId = message.params?.requestId;
        if (typeof requestId === 'string' || typeof requestId === 'number')
          this.active.get(requestId)?.abort();
      }
      return;
    }
    const abort = new AbortController();
    this.active.set(message.id, abort);
    const signal = options?.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
    try {
      signal.throwIfAborted();
      let result: Record<string, unknown>;
      switch (message.method) {
        case 'initialize':
          result = {
            protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: this.name, version: '1.0.0' },
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: this.tools.map((tool) => tool.definition) };
          break;
        case 'tools/call': {
          const tool = this.tools.find(
            (candidate) => candidate.definition.name === message.params?.name,
          );
          if (!tool) {
            this.onmessage?.({
              jsonrpc: '2.0',
              id: message.id,
              error: { code: -32602, message: 'Unknown plugin tool' },
            });
            return;
          }
          try {
            const value = await tool.execute(message.params?.arguments ?? {}, signal);
            result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
          } catch (error) {
            const text =
              error instanceof z.ZodError
                ? 'Plugin input or response is invalid.'
                : error instanceof Error
                  ? error.message
                  : 'Plugin tool failed.';
            result = { isError: true, content: [{ type: 'text', text }] };
          }
          break;
        }
        default:
          this.onmessage?.({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Method not found' },
          });
          return;
      }
      signal.throwIfAborted();
      if (!this.closed) this.onmessage?.({ jsonrpc: '2.0', id: message.id, result });
    } finally {
      this.active.delete(message.id);
    }
  }
}
