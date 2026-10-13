import type { Context, JsonValue } from '@earendil-works/chord';
import type { TSchema } from '@earendil-works/pi-ai';
import {
  defineExtension,
  defineTool,
  hook,
  ToolTask,
  type Extension,
  type HookApi,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolHookCall,
} from '@earendil-works/pi-durable';
import { createToolSearchTool } from '@earendil-works/pi-durable/tool-search';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import { createErrorToolResult, toModelToolResult } from '../toolResults';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../types';
import { PiCodemodeFiles, retainPiCodemodeArtifacts } from './piCodemodeFiles';
import { retainToolInstructions, toolInstructionsSection } from './piToolInstructions';

type PiDurableToolOptions = {
  name: string;
  tools: readonly RuntimeTool[];
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
  // Code Mode uses the existing JavaScript capability and approval setting. Older
  // clients retain run_js; new clients expose only the upstream script tool.
  const codemode =
    catalog.get('run_js')?.approval !== 'deny' && catalog.has('run_js')
      ? options.codemode
      : undefined;
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
      return tool.ref.source === 'builtin' && modelImages ? { ...stored, modelImages } : stored;
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
    .filter((tool) => tool.approval !== 'deny' && !(codemode && tool.providerName === 'run_js'))
    .map((tool) =>
      defineTool({
        name: tool.providerName,
        description: tool.description,
        parameters: tool.inputSchema as TSchema,
        structuredOutputSchema: {
          type: 'object',
          properties: {
            value: tool.outputSchema ?? {},
            artifacts: { type: 'array', items: {} },
          },
          required: ['value', 'artifacts'],
        } as TSchema,
        callers: tool.callers ?? ['model', 'tools'],
        ...(tool.ref.source === 'mcp' ? { deferred: true as const } : {}),
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
          const { tool: current } = await resolve(catalog.get('run_js')!, api, context);
          if (current.approval === 'deny') throw new Error('JavaScript execution is disabled.');
          return tool.execute(args, api, context);
        },
      })),
      ...(options.tools.some((tool) => tool.ref.source === 'mcp' && tool.approval !== 'deny')
        ? [createToolSearchTool()]
        : []),
    ],
    sections: [
      ...(options.tools.some((tool) => tool.ref.source === 'builtin' && tool.approval !== 'deny')
        ? [toolInstructionsSection]
        : []),
      ...(codemode?.sections ?? []),
    ],
    hooks: [
      hook(ToolTask, {
        async beforeTool(call, api, context) {
          const blocked = await options.beforeCall?.(call, api, context);
          if (blocked) return { block: blocked };
          const template = catalog.get(call.name === 'codemode' && codemode ? 'run_js' : call.name);
          // Upstream discovery and Code Mode have no application-side effect to approve.
          if (!template) return;
          const { tool: target } = await resolve(template, api, context);
          if (target.approval === 'deny') return { block: 'This tool is disabled.' };
          if (target.failureGroup && failedGroups.has(target.failureGroup))
            return { block: 'This tool group stopped after an earlier failure.' };
          if (target.approval === 'auto') return;
          const input = RuntimeJsonValueSchema.parse(call.arguments);
          if (!(await options.approve(target, input, call, api, context)))
            return { block: 'The user denied this tool call.' };
        },
        async afterTool(call, result, api, context) {
          if (
            call.parent &&
            result.details &&
            typeof result.details === 'object' &&
            !Array.isArray(result.details)
          ) {
            const details = result.details as PiToolDetails;
            if (details.kind === 'cherry.tool-result')
              await retainPiCodemodeArtifacts(
                api,
                call.parent.taskId,
                details.output.artifacts,
                context,
              );
          }
          if (call.name !== 'codemode' || !codemode) return;
          const files = await api.snapshot(PiCodemodeFiles, api.taskId, context);
          const text = (result.output ?? [])
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n');
          const value = RuntimeJsonValueSchema.parse({
            output: text,
            details: result.details ?? null,
          });
          const output: RuntimeToolResult = {
            value,
            modelValue: text,
            artifacts: files?.artifacts ?? [],
          };
          const tool = catalog.get('run_js')!;
          return {
            ...result,
            details: JSON.parse(
              JSON.stringify({
                kind: 'cherry.tool-result',
                ref: tool.ref,
                providerName: 'codemode',
                displayName: 'Code Mode',
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
    output: [
      { type: 'text', text: JSON.stringify(toModelToolResult(stored)) },
      ...(modelImages ?? []).map((item) => ({
        type: 'image' as const,
        data: item.data,
        mimeType: item.mediaType,
      })),
    ],
    // Error values may have a different shape from a capability's success schema.
    ...(!output.failure
      ? { structuredOutput: { value: output.value, artifacts: output.artifacts } }
      : {}),
    isError: output.failure !== undefined,
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
