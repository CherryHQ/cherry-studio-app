import type { CallToolResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

const SelfSchema = z.object({
  self: z.object({
    workspace: z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }),
    user: z.object({ id: z.string().uuid(), name: z.string().max(200).nullish() }),
  }),
});

export function parseNotionSelf(value: unknown) {
  const parsed = SelfSchema.safeParse(value);
  if (!parsed.success)
    throw new PluginError('request', 'Notion did not return a workspace identity.');
  const { workspace, user } = parsed.data.self;
  return {
    id: `${workspace.id}/${user.id}`,
    label: user.name ? `${workspace.name} · ${user.name}` : workspace.name,
  };
}

export function readNotionSelf(result: CallToolResult) {
  if (result.isError)
    throw new PluginError('access', 'Notion denied the workspace identity lookup.');
  if (result.structuredContent) return parseNotionSelf(result.structuredContent);
  try {
    const text = result.content.find((block) => block.type === 'text');
    return parseNotionSelf(text?.type === 'text' ? JSON.parse(text.text) : undefined);
  } catch (error) {
    if (error instanceof PluginError) throw error;
    throw new PluginError('request', 'Notion returned an invalid workspace identity.');
  }
}
