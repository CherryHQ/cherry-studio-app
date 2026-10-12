import type { AssistantMessage, ToolResultMessage, Usage } from '@earendil-works/pi-ai';
import {
  ToolResultEntry,
  type EntryRecord,
  type JsonObject,
  type SubmissionRecord,
} from '@earendil-works/pi-durable';
import { z } from 'zod';

import { createTextPreview } from '@/shared/utils/textPreview';

import type { RuntimeDurableSubmission, RuntimeDurableTurn } from '../durableTypes';
import { RuntimeJsonValueSchema, RuntimeOptionsSchema } from '../runtimeSchemas';
import {
  createDeniedToolResult,
  createErrorToolResult,
  createInterruptedToolResult,
} from '../toolResults';
import type {
  RuntimeError,
  RuntimeOutputPart,
  RuntimeTool,
  RuntimeToolInputPreview,
  RuntimeUsage,
} from '../types';
import { PI_TOOL_CALL_TOOL_NAME } from './piDeferredToolDiscovery';

const ToolRefSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('builtin'), capabilityId: z.string().min(1) }),
  z.object({
    source: z.literal('mcp'),
    serverId: z.string().min(1),
    rawToolName: z.string().min(1),
  }),
]);

export const PiToolBlueprintSchema = z.object({
  ref: ToolRefSchema,
  providerName: z.string().min(1),
  displayName: z.string(),
  description: z.string(),
  inputSchema: RuntimeJsonValueSchema,
  inputPreview: z.object({ textField: z.string(), nameField: z.string().optional() }).optional(),
  approval: z.enum(['auto', 'ask', 'deny']),
  failureGroup: z.string().optional(),
  autoApprovalEligible: z.boolean().optional(),
});

export const PiConfigurationSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['language', 'image']).default('language'),
  model: z.object({ providerId: z.string().min(1), modelId: z.string().min(1) }),
  instructions: z.string(),
  options: RuntimeOptionsSchema,
  tools: z.array(PiToolBlueprintSchema),
});

const PiSubmissionSchema = z.object({
  kind: z.literal('cherry.input'),
  version: z.literal(1),
  requestId: z.string().min(1),
  turnId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  createdAt: z.number().finite().nonnegative(),
  metadata: z.record(z.string(), RuntimeJsonValueSchema),
  tools: z.array(PiToolBlueprintSchema),
});
export type PiStoredSubmission = z.infer<typeof PiSubmissionSchema>;
export type PiStoredConfiguration = z.infer<typeof PiConfigurationSchema>;

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  origin: z.enum(['provider', 'runtime', 'host', 'tool']).optional(),
  name: z.string().optional(),
  context: z
    .object({
      statusCode: z.number().optional(),
      providerId: z.string().optional(),
      modelId: z.string().optional(),
      finishReason: z.string().optional(),
      responseBody: z.string().optional(),
    })
    .optional(),
});
const OutputSchema = z.object({
  value: RuntimeJsonValueSchema,
  modelValue: RuntimeJsonValueSchema.optional(),
  artifacts: z.array(
    z.object({
      ref: z.object({ kind: z.literal('managed-file'), fileEntryId: z.string() }),
      mediaType: z.string(),
      name: z.string(),
      kind: z.enum(['created', 'derived']),
    }),
  ),
  failure: z.object({ error: ErrorSchema, scope: z.enum(['call', 'tool']) }).optional(),
});
const ToolDetailsSchema = z.object({
  kind: z.literal('cherry.tool-result'),
  ref: ToolRefSchema,
  providerName: z.string(),
  displayName: z.string(),
  output: OutputSchema,
  failureGroup: z.string().optional(),
});
const MetaDetailsSchema = z.object({
  kind: z.literal('cherry.meta-tool-result'),
  providerName: z.string(),
  displayName: z.string(),
  output: OutputSchema,
});

export function piToolBlueprint(tool: RuntimeTool): z.infer<typeof PiToolBlueprintSchema> {
  return PiToolBlueprintSchema.parse(tool);
}

export function piSubmissionMetadata(
  input: RuntimeDurableSubmission,
  tools: readonly RuntimeTool[],
): JsonObject {
  return detachedJson(
    PiSubmissionSchema.parse({
      ...input,
      kind: 'cherry.input',
      version: 1,
      tools: tools.map(piToolBlueprint),
    }),
  );
}

export function readPiSubmission(value: JsonObject | undefined): PiStoredSubmission {
  return PiSubmissionSchema.parse(value);
}

export function detachedJson(value: unknown): JsonObject {
  return RuntimeJsonValueSchema.parse(JSON.parse(JSON.stringify(value))) as JsonObject;
}

export function failedPiToolGroups(entries: readonly EntryRecord[]): string[] {
  const groups = new Set<string>();
  for (const entry of entries)
    for (const message of entry.model ?? []) {
      if (message.role !== 'toolResult') continue;
      const details = ToolDetailsSchema.safeParse(message.details);
      if (
        details.success &&
        details.data.failureGroup &&
        details.data.output.failure?.scope === 'tool'
      )
        groups.add(details.data.failureGroup);
    }
  return [...groups];
}

/** Native tokens include cached input in total input; keep the existing analytics convention. */
export function piDurableUsage(usage: Usage): RuntimeUsage {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return {
    inputTokens,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens || inputTokens + usage.output,
    noCacheTokens: usage.input,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    ...(usage.reasoning !== undefined ? { reasoningTokens: usage.reasoning } : {}),
  };
}

/** Bound previews of growing tool inputs; completed results settle into the Cherry transcript. */
function toolInputPreview(
  fields: { textField: string; nameField?: string },
  input: unknown,
): RuntimeToolInputPreview | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const values = input as Record<string, unknown>;
  const text = values[fields.textField];
  if (typeof text !== 'string') return undefined;
  const name = fields.nameField ? values[fields.nameField] : undefined;
  return {
    ...createTextPreview(text),
    ...(typeof name === 'string' ? { name: name.slice(0, 255) } : {}),
  };
}

export function projectPiTurn(options: {
  sessionId: string;
  record: SubmissionRecord;
  metadata: JsonObject | undefined;
  entries: readonly EntryRecord[];
  partial?: AssistantMessage;
  partialId?: string;
  active?: boolean;
  inherited?: boolean;
  toolStates?: ReadonlyMap<string, 'running' | 'input-available' | 'interrupted'>;
}): RuntimeDurableTurn {
  const stored = readPiSubmission(options.metadata);
  const { record, entries } = options;
  const parts: RuntimeOutputPart[] = [];
  const toolsByCall = new Map<string, Extract<RuntimeOutputPart, { type: 'tool' }>>();
  const usage: RuntimeUsage = {};
  let error: RuntimeError | null = null;
  let updatedAt = stored.createdAt;
  let contextTokens: number | undefined;
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  const toolTimes: NonNullable<RuntimeDurableTurn['timing']>['tools'][number][] = [];

  function assistant(message: AssistantMessage, prefix: string, streaming: boolean) {
    updatedAt = Math.max(updatedAt, message.timestamp);
    // A response's timestamp is its request start; its duration ends it.
    startedAt = Math.min(startedAt ?? message.timestamp, message.timestamp);
    endedAt = Math.max(endedAt ?? 0, message.timestamp + (message.durationMs ?? 0));
    if (!streaming) {
      const measured = piDurableUsage(message.usage);
      if ((measured.inputTokens ?? 0) > 0) contextTokens = measured.inputTokens;
      for (const key of Object.keys(measured) as (keyof RuntimeUsage)[])
        usage[key] = (usage[key] ?? 0) + (measured[key] ?? 0);
    }
    if (message.stopReason === 'error')
      error = {
        code: 'provider_error',
        message: message.errorMessage ?? 'The provider request failed.',
        retryable: true,
        origin: 'provider',
        context: {
          providerId: message.provider,
          modelId: message.model,
          finishReason: message.stopReason,
        },
      };
    message.content.forEach((block, index) => {
      const id = `${prefix}:block:${index}`;
      if (block.type === 'text' || block.type === 'thinking') {
        parts.push({
          id,
          type: block.type === 'thinking' ? 'reasoning' : 'text',
          text: block.type === 'thinking' ? block.thinking : block.text,
          state: streaming ? 'streaming' : 'done',
        });
        return;
      }
      const binding = stored.tools.find((tool) => tool.providerName === block.name);
      const target =
        block.name === PI_TOOL_CALL_TOOL_NAME && typeof block.arguments.name === 'string'
          ? stored.tools.find(
              (tool) => tool.ref.source === 'mcp' && tool.providerName === block.arguments.name,
            )
          : binding;
      const args =
        target && block.name === PI_TOOL_CALL_TOOL_NAME
          ? (block.arguments.params ?? null)
          : block.arguments;
      // A growing file body streams as a bounded preview instead of its full partial input.
      const inputPreview =
        streaming && target?.inputPreview ? toolInputPreview(target.inputPreview, args) : undefined;
      const part: Extract<RuntimeOutputPart, { type: 'tool' }> = {
        id,
        type: 'tool',
        toolCallId: block.id,
        toolRef: target?.ref ?? { source: 'meta', name: block.name },
        providerName: target?.providerName ?? block.name,
        displayName: target?.displayName ?? block.name,
        state: streaming
          ? 'input-streaming'
          : (options.toolStates?.get(block.id) ?? 'input-available'),
        ...(inputPreview ? { inputPreview } : { input: RuntimeJsonValueSchema.parse(args) }),
      };
      parts.push(part);
      toolsByCall.set(block.id, part);
      if (part.state === 'interrupted')
        part.output = createInterruptedToolResult('The tool ended without a confirmed result.');
    });
  }

  function toolResult(entry: EntryRecord, message: ToolResultMessage) {
    const part = toolsByCall.get(message.toolCallId);
    if (!part) return;
    updatedAt = Math.max(updatedAt, message.timestamp);
    endedAt = Math.max(endedAt ?? 0, message.timestamp);
    if (message.durationMs !== undefined)
      toolTimes.push({
        toolCallId: message.toolCallId,
        toolName: part.providerName,
        startedAt: message.timestamp - message.durationMs,
        completedAt: message.timestamp,
      });
    const details = ToolDetailsSchema.safeParse(message.details);
    const meta = MetaDetailsSchema.safeParse(message.details);
    if (details.success)
      Object.assign(part, {
        toolRef: details.data.ref,
        providerName: details.data.providerName,
        displayName: details.data.displayName,
      });
    const output = details.success
      ? details.data.output
      : meta.success
        ? meta.data.output
        : undefined;
    const diagnostics = ToolResultEntry.is(entry) ? entry.data.diagnostics : [];
    const diagnostic = diagnostics.find((item) => item.severity === 'error');
    const reason = diagnostic?.message ?? 'The tool did not complete.';
    if (diagnostic?.code === 'interrupted' || diagnostic?.code === 'aborted') {
      part.state = 'interrupted';
      part.output = createInterruptedToolResult(reason);
    } else if (diagnostic?.code === 'blocked') {
      part.state = 'denied';
      part.output = createDeniedToolResult(reason);
    } else if (message.isError || output?.failure) {
      const failure = output?.failure?.error ?? {
        code: diagnostic?.code ?? 'tool_execution_error',
        message: reason,
        retryable: false,
        origin: 'tool' as const,
      };
      part.state = 'error';
      part.error = failure;
      part.output = output ?? createErrorToolResult(failure);
    } else {
      part.state = 'output-available';
      part.output = output ?? {
        value: message.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n'),
        artifacts: [],
      };
    }
    for (const artifact of part.output.artifacts)
      parts.push({
        id: `pi:${entry.id}:artifact:${artifact.ref.fileEntryId}`,
        type: 'file',
        ref: artifact.ref,
        mediaType: artifact.mediaType,
        name: artifact.name,
        purpose: 'artifact',
      });
  }

  for (const entry of entries)
    for (const message of entry.model ?? []) {
      if (message.role === 'assistant') assistant(message, `pi:${entry.id}`, false);
      else if (message.role === 'toolResult') toolResult(entry, message);
    }
  if (options.partial)
    assistant(options.partial, options.partialId ?? `pi:live:${record.id}`, true);
  const answerVisible =
    record.type === 'input' &&
    record.status === 'done' &&
    entries.some((entry) => entry.id === record.answer);
  const hasAssistant =
    parts.length > 0 ||
    options.active === true ||
    answerVisible ||
    (!options.inherited && (record.status === 'unanswered' || record.status === 'queued'));
  let status: RuntimeDurableTurn['status'];
  if (options.active) status = 'running';
  else if (options.inherited && !answerVisible) {
    status = hasAssistant ? 'interrupted' : 'completed';
    error = null;
  } else if (record.status === 'queued') status = 'queued';
  else if (answerVisible) {
    status = 'completed';
    error = null;
  } else if (record.status === 'unanswered') {
    status =
      record.reason === 'aborted'
        ? 'cancelled'
        : /interrupt|orphan/.test(record.reason)
          ? 'interrupted'
          : 'failed';
    error ??= {
      code: record.reason,
      message:
        typeof record.detail === 'string'
          ? record.detail
          : 'The Agent run ended without an answer.',
      retryable: status !== 'cancelled',
      origin: 'runtime',
    };
  } else status = hasAssistant ? 'interrupted' : 'completed';
  // Recovery can read a terminal input whose last tool never produced a result entry. Persist a
  // terminal pair, never a tool that appears to keep running in the Cherry transcript forever.
  if (status !== 'running' && status !== 'queued')
    for (const part of parts)
      if (part.type === 'tool' && !part.output) {
        part.state = 'interrupted';
        part.output = createInterruptedToolResult(
          error?.message ?? 'The tool ended without a confirmed result.',
        );
      }
  return {
    identity: { sessionId: options.sessionId, turnId: stored.turnId, requestId: stored.requestId },
    userMessageId: stored.userMessageId,
    assistantMessageId: stored.assistantMessageId,
    inputBoundary: record.entry !== undefined ? `pi:${record.entry}` : null,
    answerBoundary:
      answerVisible && record.type === 'input' && record.status === 'done'
        ? `pi:${record.answer}`
        : null,
    metadata: stored.metadata,
    status,
    parts,
    usage: Object.keys(usage).length ? usage : null,
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    error,
    createdAt: stored.createdAt,
    updatedAt,
    ...(startedAt !== undefined
      ? {
          timing: {
            startedAt,
            ...(status !== 'running' && status !== 'queued' && endedAt !== undefined
              ? { completedAt: Math.max(startedAt, endedAt) }
              : {}),
            tools: toolTimes,
          },
        }
      : {}),
    hasAssistant,
  };
}
