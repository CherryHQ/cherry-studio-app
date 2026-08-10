import { asSchema, type Tool, tool } from 'ai';
import * as z from 'zod';

import { isApprovalGated } from '../isApprovalGated';
import type { ToolRegistry } from '../registry';
import type { ToolEntry } from '../types';
import { buildToolStub } from './schemaStub';

export const TOOL_INVOKE_TOOL_NAME = 'tool_invoke';

export function createToolInvokeTool<TScope>(
  registry: ToolRegistry<TScope>,
  allowedNames: ReadonlySet<string>,
  inspectedNames: Set<string>,
): Tool {
  const parsedParamsByCallId = new Map<string, Record<string, unknown>>();
  return tool({
    description: 'Invoke one deferred tool after inspecting its input signature.',
    inputSchema: z
      .object({
        name: z.string().min(1),
        params: z.record(z.string(), z.unknown()),
      })
      .strict(),
    strict: true,
    execute: async ({ name, params }, options) => {
      if (!allowedNames.has(name)) throw new Error(`Tool not available in this request: ${name}`);
      const entry = registry.getByName(name);
      if (!entry?.tool.execute) throw new Error(`Tool has no execute handler: ${name}`);
      if (
        await isApprovalGated(
          entry.tool,
          {
            experimental_context: options.experimental_context,
            input: params,
            messages: options.messages,
            toolCallId: options.toolCallId,
            toolName: name,
          },
          registry.diagnostics,
        )
      ) {
        throw new Error(`Tool requires user approval and cannot run through tool_invoke: ${name}`);
      }
      if (!inspectedNames.has(name)) {
        inspectedNames.add(name);
        throw new Error(`Inspect this tool before invoking it:\n\n${await buildToolStub(entry)}`);
      }
      const parsedParams = await validateParams(entry, params);
      parsedParamsByCallId.set(options.toolCallId, parsedParams);
      return entry.tool.execute(parsedParams, {
        ...options,
        toolCallId: `${options.toolCallId}::${name}`,
      });
    },
    toModelOutput: ({ input, output, toolCallId }) => {
      const entry = allowedNames.has(input.name) ? registry.getByName(input.name) : undefined;
      if (entry?.tool.toModelOutput) {
        return entry.tool.toModelOutput({
          input: parsedParamsByCallId.get(toolCallId) ?? input.params,
          output,
          toolCallId: `${toolCallId}::${input.name}`,
        });
      }
      return { type: 'json', value: output };
    },
  });
}

async function validateParams<TScope>(
  entry: ToolEntry<TScope>,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const validate = asSchema(entry.tool.inputSchema as Parameters<typeof asSchema>[0]).validate;
  if (!validate) return params;
  const result = await validate(params);
  if (result.success) return result.value as Record<string, unknown>;
  throw new Error(
    `Invalid params for ${entry.name}: ${result.error.message}\n\n${await buildToolStub(entry)}`,
  );
}
