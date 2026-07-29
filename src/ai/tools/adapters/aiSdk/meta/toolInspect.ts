import { type Tool, tool } from 'ai';
import * as z from 'zod';

import type { ToolRegistry } from '../registry';
import { buildToolStub } from './schemaStub';

export const TOOL_INSPECT_TOOL_NAME = 'tool_inspect';

export function createToolInspectTool(
  registry: ToolRegistry,
  allowedNames: ReadonlySet<string>,
  inspectedNames: Set<string>,
): Tool {
  return tool({
    description: 'Get the input signature for one deferred tool.',
    inputSchema: z.object({ name: z.string().min(1) }).strict(),
    outputSchema: z.string(),
    strict: true,
    execute: async ({ name }) => {
      if (!allowedNames.has(name)) throw new Error(`Tool not available in this request: ${name}`);
      const entry = registry.getByName(name);
      if (!entry) throw new Error(`Tool not found: ${name}`);
      const stub = await buildToolStub(entry);
      inspectedNames.add(name);
      return stub;
    },
    toModelOutput: ({ output }) => ({ type: 'text', value: output }),
  });
}
