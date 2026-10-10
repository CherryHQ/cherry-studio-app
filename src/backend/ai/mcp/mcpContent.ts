import { UriTemplate } from '@modelcontextprotocol/client';

import type { McpContentEntry, McpContentPreview } from '@/shared/contracts/mcp';
import { stripMcpMetadata } from '@/shared/contracts/mcpContent';

import type { McpRuntimeClient } from './mcpProtocolClient';

export async function listMcpContent(
  client: McpRuntimeClient,
  signal: AbortSignal,
): Promise<McpContentEntry[]> {
  const [resources, templates, prompts] = await Promise.all([
    client.protocolInfo?.resources
      ? client.listResources?.(undefined, { signal, cacheMode: 'refresh' })
      : undefined,
    client.protocolInfo?.resources
      ? client.listResourceTemplates?.(undefined, { signal, cacheMode: 'refresh' })
      : undefined,
    client.protocolInfo?.prompts
      ? client.listPrompts?.(undefined, { signal, cacheMode: 'refresh' })
      : undefined,
  ]);
  const result: McpContentEntry[] = [
    ...(resources?.resources ?? []).map((item) => ({
      kind: 'resource' as const,
      key: item.uri,
      title: item.title ?? item.name,
      description: item.description,
      arguments: [],
    })),
    ...(templates?.resourceTemplates ?? []).flatMap((item) => {
      try {
        return [
          {
            kind: 'template' as const,
            key: item.uriTemplate,
            title: item.title ?? item.name,
            description: item.description,
            arguments: new UriTemplate(item.uriTemplate).variableNames.map((name) => ({
              name,
              required: true,
            })),
          },
        ];
      } catch {
        return [];
      }
    }),
    ...(prompts?.prompts ?? []).map((item) => ({
      kind: 'prompt' as const,
      key: item.name,
      title: item.title ?? item.name,
      description: item.description,
      arguments: (item.arguments ?? []).map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required ?? false,
      })),
    })),
  ];
  if (result.length > 2000 || JSON.stringify(result).length > 2 * 1024 * 1024)
    throw new Error('The MCP content catalog exceeds the size limit.');
  return result;
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
    const uri = entry.kind === 'template' ? new UriTemplate(entry.key).expand(args) : entry.key;
    const result = await client.readResource(
      { uri },
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
    const data =
      resource?.blob ?? (block.type === 'image' || block.type === 'audio' ? block.data : undefined);
    const mimeType = resource?.mimeType ?? block.mimeType;
    if (typeof data === 'string' && typeof mimeType === 'string') {
      if (
        data.length * 0.75 > remaining ||
        !/^[a-zA-Z0-9+/]*={0,2}$/.test(data) ||
        !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)
      )
        throw new Error('The MCP file exceeds the size limit or has an invalid format.');
      remaining -= data.length * 0.75;
      files.push({ data, mimeType, name: `mcp-${files.length + 1}` });
    } else if (typeof block.text === 'string') text += `${block.text}\n`;
    else if (typeof resource?.text === 'string') text += `${resource.uri}\n${resource.text}\n`;
    else text += `${JSON.stringify(stripMcpMetadata(block))}\n`;
  }
  if (text.length > 256 * 1024) throw new Error('The MCP content exceeds the text limit.');
  return { serverName, title: entry.title, text, files };
}
