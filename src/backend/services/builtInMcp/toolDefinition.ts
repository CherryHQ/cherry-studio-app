import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

export type PluginTool = {
  definition: ListToolsResult['tools'][number];
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
};

export function definePluginTool<TSchema extends z.ZodObject>(
  name: string,
  description: string,
  schema: TSchema,
  execute: (input: z.infer<TSchema>, signal: AbortSignal) => Promise<unknown>,
  readOnly = true,
): PluginTool {
  return {
    definition: {
      name,
      description,
      // Describe what callers may supply, before parsing fills defaults.
      inputSchema: z.toJSONSchema(schema, {
        io: 'input',
      }) as ListToolsResult['tools'][number]['inputSchema'],
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        openWorldHint: true,
      },
    },
    execute: async (input, signal) => execute(schema.parse(input), signal),
  };
}
