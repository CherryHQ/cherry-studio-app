import { type Tool, tool } from 'ai';
import * as z from 'zod';

import type { ToolRegistry } from '../registry';
import { serializeToolSchema } from './schemaStub';

export const TOOL_SEARCH_TOOL_NAME = 'tool_search';

const searchResultSchema = z.object({
  matchedNamespaces: z.array(
    z.object({
      namespace: z.string(),
      tools: z.array(
        z.object({
          description: z.string(),
          inputSchema: z.unknown(),
          name: z.string(),
        }),
      ),
    }),
  ),
});

export function createToolSearchTool(
  registry: ToolRegistry,
  deferredNames: ReadonlySet<string>,
  inspectedNames: Set<string>,
): Tool {
  return tool({
    description: 'Discover deferred tools by namespace. This is tool discovery, not web search.',
    inputSchema: z
      .object({
        namespace: z.string().describe('Namespace filter, or an empty string for all namespaces.'),
        query: z.string().describe('Substring filter, or an empty string to browse all tools.'),
        verbose: z.boolean().describe('Whether to include full input schemas.'),
      })
      .strict(),
    outputSchema: searchResultSchema,
    strict: true,
    execute: async ({ namespace, query, verbose }) => {
      const matchedNamespaces: z.infer<typeof searchResultSchema>['matchedNamespaces'] = [];
      for (const [name, entries] of registry.getByNamespace({
        namespace: namespace || undefined,
        query: query || undefined,
      })) {
        const tools = await Promise.all(
          entries
            .filter((entry) => deferredNames.has(entry.name))
            .map(async (entry) => {
              const inputSchema = verbose
                ? await serializeToolSchema(entry.tool.inputSchema)
                : undefined;
              if (inputSchema !== undefined) inspectedNames.add(entry.name);
              return {
                description: entry.description,
                inputSchema,
                name: entry.name,
              };
            }),
        );
        if (tools.length > 0) matchedNamespaces.push({ namespace: name, tools });
      }
      return { matchedNamespaces };
    },
    toModelOutput: ({ output }) => ({ type: 'text', value: formatSearchResult(output) }),
  });
}

function formatSearchResult(output: z.infer<typeof searchResultSchema>): string {
  if (output.matchedNamespaces.length === 0) {
    return 'No tools matched. Broaden the query or browse all namespaces.';
  }
  return output.matchedNamespaces
    .flatMap((group) => [
      group.namespace,
      ...group.tools.flatMap((entry) => [
        `  - ${entry.name}: ${entry.description}`,
        ...(entry.inputSchema === undefined
          ? []
          : [`    input: ${JSON.stringify(entry.inputSchema)}`]),
      ]),
    ])
    .join('\n');
}
