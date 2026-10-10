import type { Context, JsonValue } from '@earendil-works/chord';
import type { ToolCall, TSchema } from '@earendil-works/pi-ai';
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
} from '@earendil-works/pi-durable';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import { createErrorToolResult } from '../toolResults';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../types';
import {
  createPiDeferredToolDiscoveryTools,
  PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT,
  PI_TOOL_CALL_TOOL_NAME,
} from './piDeferredToolDiscovery';

type PiDurableToolOptions = {
  name: string;
  tools: readonly RuntimeTool[];
  previousFailures?(api: HookApi, context: Context): Promise<readonly string[]>;
  beforeCall?(call: ToolCall, api: HookApi, context: Context): Promise<string | undefined>;
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
    call: ToolCall,
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
 * Adapt existing capabilities to Pi's task boundary. Every side-effect tool, including MCP dispatch,
 * is unsafe to replay after intent; Pi marks an uncertain outcome interrupted on process recovery.
 */
export function createPiDurableToolExtension(options: PiDurableToolOptions): Extension {
  const catalog = new Map(options.tools.map((tool) => [tool.providerName, tool]));
  const failedGroups = new Set<string>();
  let failedTurnId: string | undefined;
  let restoringFailures: Promise<void> = Promise.resolve();
  const dispatchedTargets = new Map<string, RuntimeTool>();
  const dispatchInvocations = new Map<string, { api: ToolExecutionApi; context: Context }>();

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
      // Callbacks cross into durable JSON here; reject invalid payloads before native persistence.
      const stored = RuntimeJsonValueSchema.parse(
        JSON.parse(JSON.stringify(result)),
      ) as RuntimeToolResult;
      if (result.failure?.scope === 'tool' && tool.failureGroup)
        failedGroups.add(tool.failureGroup);
      await options.onResult?.(tool, stored, api, context);
      return stored;
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
    .filter((tool) => tool.ref.source !== 'mcp' && tool.approval !== 'deny')
    .map((tool) =>
      defineTool({
        name: tool.providerName,
        description: tool.description,
        parameters: tool.inputSchema as TSchema,
        replay: 'unsafe',
        async execute(args, api, context) {
          const output = await execute(tool, RuntimeJsonValueSchema.parse(args), api, context);
          return resultWithDetails(tool, output);
        },
      }),
    );

  const mcp = options.tools.filter((tool) => tool.ref.source === 'mcp' && tool.approval !== 'deny');
  const discovery = createPiDeferredToolDiscoveryTools(
    mcp,
    (tool, input, callId, signal) => {
      if (!signal) throw new Error('A durable tool requires cancellation ownership.');
      const invocation = dispatchInvocations.get(callId);
      if (!invocation) throw new Error('The MCP dispatch has no active durable invocation.');
      dispatchedTargets.set(callId, tool);
      return execute(tool, input, invocation.api, invocation.context);
    },
    async (_callId, signal, _activity, operation) => {
      signal?.throwIfAborted();
      // The existing catalog owns bounded schema/search/correction output. Pi owns its storage.
      const result = operation(32_000);
      return result.activityError
        ? { ...result.modelOutput, failure: { error: result.activityError, scope: 'call' } }
        : result.modelOutput;
    },
  );
  const durableDiscovery = mcp.length
    ? discovery.map((tool) =>
        defineTool({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          // Dispatch may run an external effect. Discovery shares this conservative policy.
          replay: 'unsafe',
          async execute(args, api, context) {
            dispatchInvocations.set(api.callId, { api, context });
            try {
              const result = await tool.execute(api.callId, args, requireSignal(context));
              const output = RuntimeJsonValueSchema.parse(result.details) as RuntimeToolResult;
              const target = dispatchedTargets.get(api.callId);
              return target
                ? { ...result, ...resultWithDetails(target, output) }
                : {
                    ...result,
                    isError: output.failure !== undefined,
                    details: {
                      kind: 'cherry.meta-tool-result',
                      providerName: tool.name,
                      displayName: tool.label,
                      output,
                    },
                  };
            } finally {
              dispatchedTargets.delete(api.callId);
              dispatchInvocations.delete(api.callId);
            }
          },
        }),
      )
    : [];

  return defineExtension({
    name: options.name,
    tools: [...tools, ...durableDiscovery],
    sections: mcp.length
      ? [
          section('cherry-mcp-discovery', () => PI_DEFERRED_TOOL_DISCOVERY_SYSTEM_PROMPT, {
            tag: false,
          }),
        ]
      : [],
    hooks: [
      hook(ToolTask, {
        async beforeTool(call, api, context) {
          const blocked = await options.beforeCall?.(call, api, context);
          if (blocked) return { block: blocked };
          const template =
            call.name === PI_TOOL_CALL_TOOL_NAME
              ? discovery.find((tool) => tool.name === call.name)?.approvalTarget?.(call.arguments)
                  ?.tool
              : catalog.get(call.name);
          // Search/describe and unknown dispatch are handled by the bounded catalog adapter.
          if (!template) return;
          const { tool: target } = await resolve(template, api, context);
          if (target.approval === 'deny') return { block: 'This tool is disabled.' };
          if (target.failureGroup && failedGroups.has(target.failureGroup))
            return { block: 'This tool group stopped after an earlier failure.' };
          if (target.approval === 'auto') return;
          const input = RuntimeJsonValueSchema.parse(
            call.name === PI_TOOL_CALL_TOOL_NAME ? call.arguments.params : call.arguments,
          );
          if (!(await options.approve(target, input, call, api, context)))
            return { block: 'The user denied this tool call.' };
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
  const details: PiToolDetails = {
    kind: 'cherry.tool-result',
    ref: tool.ref,
    providerName: tool.providerName,
    displayName: tool.displayName,
    output,
    ...(tool.failureGroup ? { failureGroup: tool.failureGroup } : {}),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
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
