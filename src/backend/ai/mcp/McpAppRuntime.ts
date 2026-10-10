import { normalizeMcpAppDomains } from '@cherrystudio/mcp-app-webview';
import {
  parseJSONRPCMessage,
  type CallToolResult,
  type ReadResourceResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type Tool,
  type Transport,
} from '@modelcontextprotocol/client';
import { CallToolResultSchema } from '@modelcontextprotocol/core';
import {
  AppBridge,
  McpUiResourceMetaSchema,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';

import {
  McpAppReferenceSchema,
  type McpAppChannel,
  type McpAppHostContext,
  type McpAppLaunch,
  type McpAppReference,
  type McpAppView,
} from '@/shared/contracts/mcpApp';
import { projectMcpModelContent } from '@/shared/contracts/mcpContent';

type AppPorts = {
  read(reference: McpAppReference, uri: string, signal: AbortSignal): Promise<ReadResourceResult>;
  resources(reference: McpAppReference, signal: AbortSignal): Promise<ListResourcesResult>;
  templates(reference: McpAppReference, signal: AbortSignal): Promise<ListResourceTemplatesResult>;
  call(
    reference: McpAppReference,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CallToolResult>;
  tools(reference: McpAppReference, signal: AbortSignal): Promise<Tool[]>;
};
type AppSession = {
  reference: McpAppReference;
  bridge: AppBridge;
  transport: Transport;
  abort: AbortController;
  channel: McpAppChannel;
  initialized: boolean;
  closing: boolean;
  requestIds: Set<string>;
  removeAbort(): void;
};

/** Owns only live views. A restored tool card is never a live connection or a replay instruction. */
export class McpAppRuntime {
  private readonly sessions = new Map<string, AppSession>();
  constructor(private readonly ports: AppPorts) {}

  async open(
    input: McpAppLaunch,
    channel: McpAppChannel,
    ownerSignal: AbortSignal,
  ): Promise<McpAppView> {
    ownerSignal.throwIfAborted();
    if (this.sessions.size >= 4) throw new Error('Too many MCP Apps are open.');
    const reference = McpAppReferenceSchema.parse(input.reference);
    if (!reference.agentId) throw new Error('The MCP App has no owning Agent.');
    const response = await this.ports.read(reference, reference.resourceUri, ownerSignal);
    ownerSignal.throwIfAborted();
    const resource = response.contents.find(
      (item) => item.uri === reference.resourceUri && item.mimeType === RESOURCE_MIME_TYPE,
    );
    if (!resource) throw new Error('The server did not return an MCP App resource.');
    const html =
      'text' in resource
        ? resource.text
        : new TextDecoder('utf-8', { fatal: true }).decode(
            Uint8Array.from(atob(resource.blob), (character) => character.charCodeAt(0)),
          );
    if (new TextEncoder().encode(html).byteLength > 2 * 1024 * 1024)
      throw new Error('The MCP App exceeds the HTML size limit.');
    const metadata = McpUiResourceMetaSchema.parse(resource._meta?.ui ?? {});
    const policy = {
      connectDomains: normalizeMcpAppDomains(metadata.csp?.connectDomains, true),
      resourceDomains: normalizeMcpAppDomains(metadata.csp?.resourceDomains),
      frameDomains: [] as [],
      baseUriDomains: [] as [],
    };
    const id = randomUUID();
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, ownerSignal]);
    const bridge = new AppBridge(
      null,
      { name: 'Cherry Studio', version: Constants.expoConfig?.version ?? 'unknown' },
      {
        openLinks: {},
        serverTools: {},
        serverResources: {},
        message: { text: {} },
        updateModelContext: { text: {}, structuredContent: {} },
        sandbox: { permissions: {}, csp: policy },
      },
      {
        hostContext: {
          ...input.hostContext,
          platform: 'mobile',
          displayMode: 'fullscreen',
          availableDisplayModes: ['fullscreen'],
        },
      },
    );
    const transport: Transport = {
      start: async () => {},
      send: async (message) => {
        const serialized = JSON.stringify(message);
        if (serialized.length > 4 * 1024 * 1024)
          throw new Error('MCP App message exceeds the size limit.');
        channel.send(serialized);
      },
      close: async () => {
        transport.onclose?.();
      },
    };
    const onAbort = () => {
      void this.close(id);
    };
    const session: AppSession = {
      reference,
      bridge,
      transport,
      abort,
      channel,
      initialized: false,
      closing: false,
      requestIds: new Set(),
      removeAbort: () => ownerSignal.removeEventListener('abort', onAbort),
    };
    const active = () => {
      signal.throwIfAborted();
      if (!session.initialized || session.closing) throw new Error('The MCP App is not active.');
    };
    bridge.addEventListener('initialized', async () => {
      if (session.initialized || session.closing) return;
      session.initialized = true;
      try {
        await bridge.sendToolInput({
          arguments:
            input.input && typeof input.input === 'object' && !Array.isArray(input.input)
              ? input.input
              : {},
        });
        await bridge.sendToolResult(asToolResult(input.result));
      } catch {
        await this.close(id);
      }
    });
    bridge.oncalltool = async (params, context) => {
      active();
      return safeRequest(() =>
        this.ports.call(
          reference,
          params.name,
          params.arguments ?? {},
          AbortSignal.any([signal, context.mcpReq.signal]),
        ),
      );
    };
    bridge.setRequestHandler('tools/list', async (_request, context) => {
      active();
      return {
        tools: await safeRequest(() =>
          this.ports.tools(reference, AbortSignal.any([signal, context.mcpReq.signal])),
        ),
      };
    });
    bridge.onreadresource = async (params, context) => {
      active();
      return safeRequest(() =>
        this.ports.read(reference, params.uri, AbortSignal.any([signal, context.mcpReq.signal])),
      );
    };
    bridge.onlistresources = async (_params, context) => {
      active();
      return safeRequest(() =>
        this.ports.resources(reference, AbortSignal.any([signal, context.mcpReq.signal])),
      );
    };
    bridge.onlistresourcetemplates = async (_params, context) => {
      active();
      return safeRequest(() =>
        this.ports.templates(reference, AbortSignal.any([signal, context.mcpReq.signal])),
      );
    };
    bridge.onopenlink = async ({ url }) => {
      active();
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw new Error('Only HTTPS links are allowed.');
      await channel.openLink(url);
      return {};
    };
    // This SDK property registers a JSON-RPC request handler, not a DOM event listener.
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    bridge.onmessage = async ({ content }) => {
      active();
      if (content.some((block) => block.type !== 'text'))
        throw new Error('Only text messages are supported.');
      const text = content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n');
      if (!text.trim() || text.length > 16 * 1024) throw new Error('Invalid message.');
      await channel.message(text);
      return {};
    };
    bridge.onupdatemodelcontext = async (params) => {
      active();
      if (params.content?.some((block) => block.type !== 'text'))
        throw new Error('Only text context is supported.');
      if (JSON.stringify(params).length > 16 * 1024)
        throw new Error('Context exceeds the size limit.');
      const text = projectMcpModelContent(params)
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n');
      channel.updateContext(text);
      return {};
    };
    bridge.onrequestdisplaymode = async () => ({ mode: 'fullscreen' });
    bridge.addEventListener('requestteardown', () => {
      void this.close(id);
    });
    // Protocol.onerror is a callback, not a DOM event listener.
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    bridge.onerror = () => {
      /* Remote diagnostics may contain private content. */
    };
    this.sessions.set(id, session);
    ownerSignal.addEventListener('abort', onAbort, { once: true });
    try {
      await bridge.connect(transport);
      signal.throwIfAborted();
      return { id, title: reference.toolName, html, policy };
    } catch (error) {
      await this.close(id);
      throw error;
    }
  }

  receive(id: string, serialized: string): void {
    const session = this.sessions.get(id);
    if (!session || serialized.length > 256 * 1024) return;
    try {
      const message = parseJSONRPCMessage(JSON.parse(serialized));
      if (session.closing && 'method' in message) return;
      if ('method' in message && message.method.startsWith('ui/notifications/sandbox-')) return;
      if ('method' in message && 'id' in message) {
        const key = `${typeof message.id}:${message.id}`;
        // Replayed transport messages cannot execute the same write twice.
        if (session.requestIds.has(key) || session.requestIds.size >= 1024) return;
        session.requestIds.add(key);
      }
      session.transport.onmessage?.(message);
    } catch {
      /* Malformed web messages have no authority and are discarded. */
    }
  }
  updateContext(id: string, context: McpAppHostContext): void {
    const session = this.sessions.get(id);
    if (session && session.initialized && !session.closing)
      session.bridge.setHostContext({
        ...context,
        platform: 'mobile',
        displayMode: 'fullscreen',
        availableDisplayModes: ['fullscreen'],
      });
  }
  async close(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || session.closing) return;
    session.closing = true;
    session.abort.abort();
    session.removeAbort();
    try {
      if (session.initialized)
        await session.bridge.teardownResource({}, { timeout: 300 }).catch(() => undefined);
      await session.bridge.close().catch(() => undefined);
    } finally {
      this.sessions.delete(id);
      session.channel.closed();
    }
  }
  async closeServer(serverId: string): Promise<void> {
    await Promise.all(
      [...this.sessions]
        .filter(([, session]) => session.reference.serverId === serverId)
        .map(([id]) => this.close(id)),
    );
  }
  async stop(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}

async function safeRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error('The MCP App request was denied, cancelled, or unavailable.');
  }
}
function asToolResult(value: unknown): CallToolResult {
  const parsed = CallToolResultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { content: [{ type: 'text', text: JSON.stringify(value) ?? 'null' }] };
}
