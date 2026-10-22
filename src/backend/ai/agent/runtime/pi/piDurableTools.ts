import type { Context, JsonValue } from '@earendil-works/chord';
import type { TSchema } from '@earendil-works/pi-ai';
import {
  defineExtension,
  defineTool,
  hook,
  section,
  ToolTask,
  type Extension,
  type HookApi,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolHookCall,
  type ToolTaskInput,
} from '@earendil-works/pi-durable';
import { CODEMODE_TOOL_NAME } from '@earendil-works/pi-durable/codemode';
import { createToolSearchTool } from '@earendil-works/pi-durable/tool-search';
import { z } from 'zod';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import { createErrorToolResult, toModelToolResult } from '../toolResults';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../types';
import { PiCodemodeFiles, retainPiCodemodeArtifacts } from './piCodemodeFiles';
import { piCodemodeFailureCode } from './piCodemodeOutput';
import { PiCodemodeMcpResultEntry } from './piCodemodeResults';
import { PI_SCRIPT_CAPABILITY_NAME } from './piDurableProjection';
import {
  hasToolInstructions,
  retainToolInstructions,
  toolInstructionsSection,
} from './piToolInstructions';
import { piToolModelContent } from './piToolModelContent';

type PiDurableToolOptions = {
  name: string;
  tools: readonly RuntimeTool[];
  acceptsImages?: boolean;
  codemode?: Extension;
  previousFailures?(api: HookApi, context: Context): Promise<readonly string[]>;
  beforeCall?(call: ToolHookCall, api: HookApi, context: Context): Promise<string | undefined>;
  /** Resolve the current Pi run, including queued input and a reconstructed process generation. */
  resolve(
    tool: RuntimeTool,
    api: HookApi,
    context: Context,
  ): Promise<{ tool: RuntimeTool; turnId: string }>;
  /** The Host admits verified artifacts to its resource ledger before the next tool round. */
  onResult?(
    tool: RuntimeTool,
    result: RuntimeToolResult,
    api: ToolExecutionApi,
    context: Context,
  ): void | Promise<void>;
  /** A fresh approval on every pre-intent attempt, including after recovery. */
  approve(
    tool: RuntimeTool,
    input: RuntimeJsonValue,
    call: ToolHookCall,
    api: HookApi,
    context: Context,
  ): Promise<boolean>;
};

const codemodeRulesSection = section(
  'cherry-codemode',
  () =>
    "Code Mode store/load is temporary working data; history rebuilds, forks and restores may clear it. Save lasting results with file tools. Output paths managed-file:<id> refer to read_file file_entry_id <id>. To give a tool a file's content, read it in the script with read_file offset and max_characters, join value.text until value.complete, and pass that string; never retype file content into tool arguments.",
  { tag: false },
);

/** Stored as native ToolResultMessage.details so the UI can read structured results and artifacts. */
type PiToolDetails = {
  kind: 'cherry.tool-result';
  ref: RuntimeTool['ref'];
  providerName: string;
  displayName: string;
  output: RuntimeToolResult;
  failureGroup?: string;
};

/**
 * Adapt existing capabilities to Pi's task boundary. Every application tool
 * is unsafe to replay after intent; Pi marks an uncertain outcome interrupted on process recovery.
 */
export function createPiDurableToolExtension(options: PiDurableToolOptions): Extension {
  const catalog = new Map(options.tools.map((tool) => [tool.providerName, tool]));
  const scriptCapability = catalog.get(PI_SCRIPT_CAPABILITY_NAME);
  const codemode =
    scriptCapability && scriptCapability.approval !== 'deny' ? options.codemode : undefined;
  const failedGroups = new Set<string>();
  let failedTurnId: string | undefined;
  let restoringFailures: Promise<void> = Promise.resolve();

  async function resolve(template: RuntimeTool, api: HookApi, context: Context) {
    const binding = await options.resolve(template, api, context);
    if (
      !binding.turnId ||
      binding.tool.providerName !== template.providerName ||
      !sameCapability(binding.tool, template)
    )
      throw new Error('A durable tool resolved to a different capability.');
    if (failedTurnId !== binding.turnId) {
      failedGroups.clear();
      failedTurnId = binding.turnId;
      restoringFailures = (async () => {
        for (const group of (await options.previousFailures?.(api, context)) ?? [])
          failedGroups.add(group);
      })();
    }
    await restoringFailures;
    return binding;
  }

  async function execute(
    template: RuntimeTool,
    input: RuntimeJsonValue,
    api: ToolExecutionApi,
    context: Context,
  ): Promise<RuntimeToolResult> {
    const { tool, turnId } = await resolve(template, api, context);
    const signal = requireSignal(context);
    signal.throwIfAborted();
    // Approval is admitted by the native beforeTool hook, before its durable execution intent.
    // Recheck explicit denial and group failure at invocation too; sibling calls can fail meanwhile.
    if (tool.approval === 'deny') throw new Error('This tool is disabled.');
    if (tool.failureGroup && failedGroups.has(tool.failureGroup))
      throw new Error('This tool group stopped after an earlier failure.');
    try {
      const result = await tool.execute({
        input,
        signal,
        toolCallId: api.callId,
        turnId,
      });
      // Only trusted application callbacks can contribute system instructions. MCP payloads cannot.
      const { instructions, instructionsFailureValue, modelValue, modelImages, ...output } = result;
      // Callbacks cross into durable JSON here; reject invalid payloads before native persistence.
      let stored = RuntimeJsonValueSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...output,
            ...(tool.ref.source === 'builtin' && modelValue !== undefined ? { modelValue } : {}),
          }),
        ),
      ) as RuntimeToolResult;
      if (result.failure?.scope === 'tool' && tool.failureGroup)
        failedGroups.add(tool.failureGroup);
      if (instructions && !stored.failure && tool.ref.source === 'builtin') {
        try {
          await retainToolInstructions(instructions, api, context);
        } catch (error) {
          signal.throwIfAborted();
          if (instructionsFailureValue === undefined) throw error;
          const fallback = RuntimeJsonValueSchema.parse(instructionsFailureValue);
          stored = { ...stored, value: fallback, modelValue: fallback };
        }
      }
      await options.onResult?.(tool, stored, api, context);
      if (stored.artifacts.length || tool.ref.source === 'mcp') {
        const task = await api.getTask(api.taskId, context);
        const input = task?.input as ToolTaskInput | undefined;
        if (input?.kind === 'nested') {
          if (tool.ref.source === 'mcp') {
            const ref = tool.ref;
            await api.commit(
              (tx) =>
                tx.appendEntry(PiCodemodeMcpResultEntry, api.conversationId, {
                  data: {
                    parentCallId: input.parentCallId,
                    callId: api.callId,
                    ref,
                    providerName: tool.providerName,
                    displayName: tool.displayName,
                    input: RuntimeJsonValueSchema.parse(input.call.arguments),
                    output: RuntimeJsonValueSchema.parse(stored),
                  },
                }),
              context,
            );
          }
          await retainPiCodemodeArtifacts(
            api,
            input.parent,
            input.parentCallId,
            stored.artifacts,
            context,
          );
        }
      }
      // Built-in vision output decides its own model support; MCP images follow the model's.
      return modelImages && (tool.ref.source === 'builtin' || options.acceptsImages !== false)
        ? { ...stored, modelImages }
        : stored;
    } catch (error) {
      signal.throwIfAborted();
      const failure = { ...normalizeAiError(error), origin: 'tool' as const };
      return {
        ...createErrorToolResult(failure),
        failure: { error: failure, scope: 'call' },
      };
    }
  }

  const tools = options.tools
    .filter((tool) => tool.approval !== 'deny' && tool !== scriptCapability)
    .map((tool) =>
      defineTool({
        name: tool.providerName,
        description: tool.description,
        parameters: tool.inputSchema as TSchema,
        structuredOutputSchema: {
          type: 'object',
          properties: {
            value: tool.ref.source === 'builtin' ? (tool.outputSchema ?? {}) : {},
            artifacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ref: {
                    type: 'object',
                    properties: {
                      kind: { const: 'managed-file' },
                      fileEntryId: { type: 'string' },
                    },
                    required: ['kind', 'fileEntryId'],
                  },
                  mediaType: { type: 'string' },
                  name: { type: 'string' },
                  kind: { enum: ['created', 'derived'] },
                },
                required: ['ref', 'mediaType', 'name', 'kind'],
              },
            },
          },
          required: ['value', 'artifacts'],
        } as TSchema,
        ...(tool.ref.source === 'mcp' || tool.deferred ? { deferred: true as const } : {}),
        replay: 'unsafe',
        async execute(args: unknown, api: ToolExecutionApi, context: Context) {
          const output = await execute(tool, RuntimeJsonValueSchema.parse(args), api, context);
          return resultWithDetails(tool, output);
        },
      }),
    );

  return defineExtension({
    name: options.name,
    tools: [
      ...tools,
      ...(codemode?.tools ?? []).map((tool) => ({
        ...tool,
        async execute(args: unknown, api: ToolExecutionApi, context: Context) {
          const { tool: current, turnId } = await resolve(scriptCapability!, api, context);
          if (current.approval === 'deny') throw new Error('JavaScript execution is disabled.');
          // The capability's execute is the Host's boundary for tool diagnostics; it sees the
          // script's outcome while Pi keeps the upstream result.
          let result: ToolExecutionResult | undefined;
          await current.execute({
            input: RuntimeJsonValueSchema.parse(args),
            signal: requireSignal(context),
            toolCallId: api.callId,
            turnId,
            run: async () => {
              result = await tool.execute(args, api, context);
              const value: RuntimeJsonValue = result.isError
                ? { status: 'error', code: piCodemodeFailureCode(result) }
                : { status: 'ok' };
              return { value, artifacts: [] };
            },
          });
          if (!result) throw new Error('The JavaScript capability did not run its script.');
          return result;
        },
      })),
      ...(tools.some((tool) => tool.deferred) ? [createToolSearchTool()] : []),
    ],
    sections: [
      ...(options.tools.some((tool) => tool.ref.source === 'builtin' && tool.approval !== 'deny')
        ? [toolInstructionsSection]
        : []),
      ...(codemode ? [...(codemode.sections ?? []), codemodeRulesSection] : []),
    ],
    hooks: [
      hook(ToolTask, {
        async beforeTool(call, api, context) {
          const blocked = await options.beforeCall?.(call, api, context);
          if (blocked) return { block: blocked };
          const template =
            call.name === CODEMODE_TOOL_NAME && codemode
              ? scriptCapability
              : catalog.get(call.name);
          // Upstream discovery and Code Mode have no application-side effect to approve.
          if (!template) return;
          const { tool: target } = await resolve(template, api, context);
          if (target.approval === 'deny') return { block: 'This tool is disabled.' };
          if (target.failureGroup && failedGroups.has(target.failureGroup))
            return { block: 'This tool group stopped after an earlier failure.' };
          if (
            target.requiredInstructions &&
            !(await hasToolInstructions(target.requiredInstructions.key, api, context))
          )
            return { block: target.requiredInstructions.refusal };
          if (target.approval === 'auto') return;
          const input = RuntimeJsonValueSchema.parse(call.arguments);
          if (!(await options.approve(target, input, call, api, context)))
            return { block: 'The user denied this tool call.' };
        },
        async afterTool(call, result, api, context) {
          if (call.name !== CODEMODE_TOOL_NAME || !codemode) return;
          const files = await api.snapshot(PiCodemodeFiles, api.taskId, context);
          const text = (result.output ?? [])
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n');
          // Upstream lists each call under its provider name; an MCP alias needs its display name.
          const details = z
            .looseObject({ calls: z.array(z.looseObject({ name: z.string() })) })
            .safeParse(result.details);
          const value = RuntimeJsonValueSchema.parse({
            output: text,
            details: details.success
              ? {
                  ...details.data,
                  calls: details.data.calls.map((item) => {
                    const called = catalog.get(item.name);
                    return called?.ref.source === 'mcp'
                      ? { ...item, title: called.displayName }
                      : item;
                  }),
                }
              : (result.details ?? null),
          });
          const output: RuntimeToolResult = {
            value,
            modelValue: text,
            artifacts: files?.artifacts ?? [],
          };
          return {
            ...result,
            details: JSON.parse(
              JSON.stringify({
                kind: 'cherry.tool-result',
                ref: scriptCapability!.ref,
                providerName: CODEMODE_TOOL_NAME,
                displayName: scriptCapability!.displayName,
                output,
              }),
            ),
          };
        },
      }),
    ],
  });
}

function requireSignal(context: Context): AbortSignal {
  if (!context.abortSignal) throw new Error('A durable tool requires cancellation ownership.');
  return context.abortSignal;
}

function resultWithDetails(tool: RuntimeTool, output: RuntimeToolResult): ToolExecutionResult {
  const { modelImages, ...stored } = output;
  const details: PiToolDetails = {
    kind: 'cherry.tool-result',
    ref: tool.ref,
    providerName: tool.providerName,
    displayName: tool.displayName,
    output: stored,
    ...(tool.failureGroup ? { failureGroup: tool.failureGroup } : {}),
  };
  return {
    output:
      tool.ref.source === 'mcp'
        ? piToolModelContent(output, true)
        : [
            { type: 'text', text: JSON.stringify(toModelToolResult(stored)) },
            ...(modelImages ?? []).map((item) => ({
              type: 'image' as const,
              data: item.data,
              mimeType: item.mediaType,
            })),
          ],
    // Error values may have a different shape from a capability's success schema.
    ...(!output.failure
      ? {
          structuredOutput: {
            // Scripts can print or forward this value to a model. Use the same bounded channel
            // as direct calls; the durable details keep UI metadata and managed media intact.
            value:
              tool.ref.source === 'mcp'
                ? RuntimeJsonValueSchema.parse({ content: piToolModelContent(output, true, false) })
                : output.value,
            artifacts: output.artifacts,
          },
        }
      : {}),
    isError: output.failure !== undefined,
    // A failed nested call omits its value, so Code Mode reports its error diagnostics instead.
    ...(output.failure
      ? {
          diagnostics: [
            {
              severity: 'error' as const,
              code: output.failure.error.code,
              message: output.failure.error.message,
            },
          ],
        }
      : {}),
    details: JSON.parse(JSON.stringify(details)) as JsonValue,
  };
}

function sameCapability(left: RuntimeTool, right: RuntimeTool): boolean {
  if (left.ref.source === 'builtin')
    return right.ref.source === 'builtin' && left.ref.capabilityId === right.ref.capabilityId;
  return (
    right.ref.source === 'mcp' &&
    left.ref.serverId === right.ref.serverId &&
    left.ref.rawToolName === right.ref.rawToolName
  );
}
