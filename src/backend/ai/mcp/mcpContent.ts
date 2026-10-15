import type { McpContentEntry, McpContentPreview, McpPromptEntry } from '@/shared/contracts/mcp';
import { readMcpBinaryBlock, stripMcpMetadata } from '@/shared/contracts/mcpContent';

import type { McpRuntimeClient } from './mcpProtocolClient';

export async function listMcpPrompts(
  client: McpRuntimeClient,
  signal: AbortSignal,
): Promise<McpPromptEntry[]> {
  if (!client.protocolInfo?.prompts || !client.listPrompts) return [];
  const result = await client.listPrompts(undefined, { signal, cacheMode: 'refresh' });
  const entries: McpPromptEntry[] = result.prompts.map((item) => ({
    kind: 'prompt',
    key: item.name,
    title: item.title?.trim() || item.name,
    description: item.description,
    arguments: (item.arguments ?? []).map((arg) => ({
      name: arg.name,
      description: arg.description,
      required: arg.required ?? false,
    })),
  }));
  if (entries.length > 2000 || JSON.stringify(entries).length > 2 * 1024 * 1024)
    throw new Error('The MCP prompt catalog exceeds the size limit.');
  return entries;
}

export async function readMcpContent(
  client: McpRuntimeClient,
  serverName: string,
  entry: McpContentEntry,
  args: Record<string, string>,
  signal: AbortSignal,
): Promise<McpContentPreview> {
  if (entry.arguments.some((arg) => arg.required && !args[arg.name]?.trim()))
    throw new Error('Missing content arguments.');
  if (JSON.stringify(args).length > 64 * 1024)
    throw new Error('Content arguments exceed the size limit.');
  const blocks: unknown[] = [];
  if (entry.kind === 'prompt') {
    if (!client.protocolInfo?.prompts || !client.getPrompt)
      throw new Error('Prompts are unavailable.');
    const result = await client.getPrompt(
      { name: entry.key, arguments: args },
      { signal, timeout: 10 * 60 * 1000 },
    );
    // Server roles are quoted in a user draft, never promoted to assistant/system instructions.
    for (const message of result.messages) {
      blocks.push({ type: 'text', text: `[${message.role}]` }, message.content);
    }
  } else {
    if (!client.protocolInfo?.resources || !client.readResource)
      throw new Error('Resources are unavailable.');
    const result = await client.readResource(
      { uri: entry.key },
      { signal, cacheMode: 'refresh', timeout: 10 * 60 * 1000 },
    );
    blocks.push(...result.contents.map((resource) => ({ type: 'resource', resource })));
  }
  let text = '';
  let remaining = 8 * 1024 * 1024;
  const files: McpContentPreview['files'] = [];
  for (const raw of blocks.slice(0, 128)) {
    const block = raw as Record<string, unknown>;
    const resource =
      block.type === 'resource' ? (block.resource as Record<string, unknown>) : undefined;
    const binary = readMcpBinaryBlock(block);
    if (binary) {
      if (!binary.valid || binary.bytes > remaining)
        throw new Error('The MCP file exceeds the size limit or has an invalid format.');
      remaining -= binary.bytes;
      files.push({
        data: binary.data,
        mimeType: binary.mimeType,
        name: `mcp-${files.length + 1}`,
      });
    } else if (typeof block.text === 'string') text += `${block.text}\n`;
    else if (typeof resource?.text === 'string') text += `${resource.uri}\n${resource.text}\n`;
    else text += `${JSON.stringify(stripMcpMetadata(block))}\n`;
  }
  if (text.length > 256 * 1024) throw new Error('The MCP content exceeds the text limit.');
  return { serverName, title: entry.title, text, files };
}
