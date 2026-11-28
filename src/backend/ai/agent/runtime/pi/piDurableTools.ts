import { withAbortSignal, type Context } from '@earendil-works/chord/context';
import type { JsonValue } from '@earendil-works/chord/json';
import {
  defineExtension,
  defineTool,
  hook,
  section,
  ToolTask,
  type Extension,
  type HookApi,
  type NestedToolCall,
  type TaskId,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolHookCall,
  type ToolPark,
  type ToolTaskInput,
  type Tx,
  LiveDoc,
} from '@earendil-works/pi-durable';
import { CODEMODE_TOOL_NAME } from '@earendil-works/pi-durable/codemode';
import { createToolSearchTool } from '@earendil-works/pi-durable/tool-search';
import { z } from 'zod';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';
import { raceAbort } from '@/backend/utils/raceAbort';

import {
  DURABLE_QUESTION_TOOL_NAME,
  type RuntimeExecutionIdentity,
  type RuntimePendingQuestion,
  RuntimeToolDiscoveryError,
  RuntimeToolUnavailableError,
} from '../durableTypes';
import { RuntimeJsonValueSchema } from '../runtimeSchemas';
import {
  createCallErrorToolResult,
  createErrorToolResult,
  toModelToolResult,
} from '../toolResults';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../types';
import { PiCodemodeFiles, retainPiCodemodeArtifacts } from './piCodemodeFiles';
import { piCodemodeFailureCode } from './piCodemodeOutput';
import { PiCodemodeMcpResultEntry } from './piCodemodeResults';
import { PI_SCRIPT_CAPABILITY_NAME } from './piDurableProjection';
import {
  hasCommittedTaskSignal,
  hasLiveTool,
  PiCodemodeDeadlineDoc,
  PiPendingApprovalsDoc,
  PiPendingQuestionsDoc,
  pruneStaleInteractions,
  ToolApprovalDecisionSchema,
  ToolApprovalSignal,
  UserQuestionAnswerSignal,
} from './piPendingInteractions';
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
  previousFailures?(
    api: Pick<HookApi, 'conversationId' | 'snapshot'>,
    context: Context,
  ): Promise<readonly string[]>;
  beforeCall?(call: ToolHookCall, api: HookApi, context: Context): Promise<string | undefined>;
  /** Resolve the current Pi run, including queued input and a reconstructed process generation. */
  resolve(
    tool: RuntimeTool,
    api: Pick<HookApi, 'conversationId' | 'snapshot'>,
    context: Context,
  ): Promise<{ tool: RuntimeTool; turnId: string }>;
  /** The Host admits verified artifacts to its resource ledger before the next tool round. */
  onResult?(
    tool: RuntimeTool,
    result: RuntimeToolResult,
    api: ToolExecutionApi,
    context: Context,
  ): void | Promise<void>;
  durableInteractions?: {
    identity(
      api: Pick<HookApi, 'conversationId' | 'snapshot'>,
      context: Context,
    ): Promise<RuntimeExecutionIdentity>;
    hasPendingHostQuestion?(identity: { turnId: string; requestId: string }): boolean;
    /** Pi's public HookApi exposes reads; the Harness provides writes for tool hooks. */
    commit(change: (tx: Tx) => Promise<void>, context: Context): Promise<void>;
  };
  /** In-process approval for callers without durable interactions. */
  approve?(
    tool: RuntimeTool,
    input: RuntimeJsonValue,
    call: ToolHookCall,
    api: HookApi,
    context: Context,
  ): Promise<boolean>;
};

const CODEMODE_PARK_REASON = Symbol('cherry.codemode.park');

const codemodeRulesSection = section(
  'cherry-codemode',
  () =>
    `Use native store/load for intermediate scripts, research data and confirmed file receipts. This is disposable conversation cache, never the file library or a backup. A script's store writes commit only when the ENTIRE script succeeds: save each chunk in a separate short successful call before running fallible work. For example, first store("office.script", "first chunk"); in a later call store("office.script", load("office.script") + "next chunk"). Missing keys after a cache reset require recreating only missing material; interrupted model text is never a saved chunk.
Keep data and source under separate keys. Read and change their local values instead of printing or retyping the full contents; pass load("office.script") directly as code to tools.run_office_script, or pass locally parsed cached JSON to tools.create_workbook. Execute only after all intended chunks are saved. A saved value is not proof its script ran successfully.
After creating a requested deliverable, store its returned value.fileEntryId and END that script successfully. Inspect or edit that file in a separate script; checking failure must not restart successful creation. A missing receipt is not evidence of successful or failed side effects: inspect existing tool receipts before retrying an uncertain operation. Keep all intermediates in store; use library tools only for requested deliverables.
Overflow paths store:<key> are read with load(key); print only the needed slice or summary. Managed-file:<id> is a deliverable; read it with read_file file_entry_id <id>, joining value.text until value.complete inside Code Mode. Never retype saved content into model arguments.`,
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

const TOOL_SETTINGS_CHANGED_MESSAGE =
  'Tool settings changed since it was offered. Start a new turn to retry.';
const TOOL_DISCOVERY_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;
const SCRIPT_TIMEOUT_SETTLE_GRACE_MS = 20;

/**
 * Adapt existing capabilities to Pi's task boundary. Side effects are unsafe to replay after intent.
 */
export function createPiDurableToolExtension(options: PiDurableToolOptions): Extension {
  const catalog = new Map(options.tools.map((tool) => [tool.providerName, tool]));
  const scriptCapability = catalog.get(PI_SCRIPT_CAPABILITY_NAME);
  const codemode =
    scriptCapability && scriptCapability.approval !== 'deny' ? options.codemode : undefined;
  const interactions = options.durableInteractions;
  const codemodeRuns = new Map<number, (childTaskId: TaskId) => void>();
  const admittedInProcess = new Set<string>();
  const discoveryRetries = new Map<number, number>();
  const failedGroups = new Set<string>();
  let failedTurnId: string | undefined;
  let restoringFailures: Promise<void> = Promise.resolve();

  function isApprovedDecision(value: unknown, live: RuntimeTool): boolean {
    const parsed = ToolApprovalDecisionSchema.safeParse(value);
    return (
      parsed.success &&
      parsed.data.decision === 'approve' &&
      parsed.data.executionSettingsKey === live.executionSettingsKey
    );
  }

  async function resolve(
    template: RuntimeTool,
    api: Pick<HookApi, 'conversationId' | 'snapshot'>,
    context: Context,
    resolveOptions?: { allowSettingsDrift?: boolean },
  ) {
    const binding = await options.resolve(template, api, context);
    if (
      !binding.turnId ||
      binding.tool.providerName !== template.providerName ||
      !sameCapability(binding.tool, template)
    )
      throw new RuntimeToolUnavailableError('A durable tool resolved to a different capability.');
    const settingsDrifted =
      (template.executionSettingsKey !== undefined &&
        binding.tool.executionSettingsKey !== template.executionSettingsKey) ||
      binding.tool.approval !== template.approval;
    if (settingsDrifted && !resolveOptions?.allowSettingsDrift)
      throw new Error(TOOL_SETTINGS_CHANGED_MESSAGE);
    if (failedTurnId !== binding.turnId) {
      failedGroups.clear();
      failedTurnId = binding.turnId;
      restoringFailures = (async () => {
        for (const group of (await options.previousFailures?.(api, context)) ?? [])
          failedGroups.add(group);
      })();
    }
    await restoringFailures;
    return { ...binding, settingsDrifted };
  }

  async function scheduleDiscoveryRetry(
    api: Pick<HookApi, 'now' | 'snapshot' | 'taskId'>,
    parentTaskId: TaskId | undefined,
    context: Context,
  ): Promise<{ retryAt: number } | { timedOut: true }> {
    const deadlineDoc =
      parentTaskId !== undefined
        ? await api.snapshot(PiCodemodeDeadlineDoc, parentTaskId, context)
        : undefined;
    const deadline = deadlineDoc?.deadline;
    if (deadline !== undefined && api.now() >= deadline) {
      return { timedOut: true };
    }
    const taskKey = Number(api.taskId);
    const retryAttempt = (discoveryRetries.get(taskKey) ?? 0) + 1;
    discoveryRetries.set(taskKey, retryAttempt);
    const delay =
      TOOL_DISCOVERY_RETRY_DELAYS_MS[
        Math.min(retryAttempt - 1, TOOL_DISCOVERY_RETRY_DELAYS_MS.length - 1)
      ]!;
    const retryAt =
      deadline !== undefined ? Math.min(deadline, api.now() + delay) : api.now() + delay;
    if (parentTaskId !== undefined) {
      codemodeRuns.get(Number(parentTaskId))?.(api.taskId);
    }
    return { retryAt };
  }

  async function execute(
    template: RuntimeTool,
    input: RuntimeJsonValue,
    api: ToolExecutionApi,
    context: Context,
  ): Promise<ToolExecutionResult | ToolPark> {
    const approvalId = toolApprovalId(api, api.callId);
    const approvedInProcess = admittedInProcess.has(approvalId);
    try {
      let tool: RuntimeTool;
      let turnId: string;
      try {
        ({ tool, turnId } = await resolve(template, api, context));
      } catch (error) {
        if (error instanceof RuntimeToolDiscoveryError && interactions) {
          const received = await api.readSignal(ToolApprovalSignal, api.callId, context);
          const parsedDecision =
            received?.kind === 'value'
              ? ToolApprovalDecisionSchema.safeParse(received.value)
              : undefined;
          if (parsedDecision?.success && parsedDecision.data.decision === 'approve') {
            if (
              template.executionSettingsKey !== undefined &&
              parsedDecision.data.executionSettingsKey !== template.executionSettingsKey
            ) {
              throw new Error(TOOL_SETTINGS_CHANGED_MESSAGE, { cause: error });
            }
            const task = await api.getTask(api.taskId, context);
            const taskInput = task?.input as ToolTaskInput | undefined;
            const parentTaskId = taskInput?.kind === 'nested' ? taskInput.parent : undefined;
            const retry = await scheduleDiscoveryRetry(api, parentTaskId, context);
            if ('timedOut' in retry) {
              throw new Error('Script timed out before this tool call could run.', {
                cause: error,
              });
            }
            return { kind: 'sleep', until: retry.retryAt };
          }
        }
        throw error;
      }
      discoveryRetries.delete(Number(api.taskId));
      const signal = requireSignal(context);
      signal.throwIfAborted();
      // Recheck explicit denial, approval, and group failure at invocation too; siblings can fail meanwhile.
      if (tool.approval === 'deny') throw new Error('This tool is disabled.');
      const currentRequiresApproval =
        tool.approval === 'ask' || Boolean(tool.requiresApproval?.(input));
      if (currentRequiresApproval) {
        if (interactions) {
          const received = await api.readSignal(ToolApprovalSignal, api.callId, context);
          signal.throwIfAborted();
          if (received?.kind !== 'value') throw new Error(TOOL_SETTINGS_CHANGED_MESSAGE);
          const decision = ToolApprovalDecisionSchema.parse(received.value);
          if (decision.decision !== 'approve') throw new Error('The user denied this tool call.');
          if (decision.executionSettingsKey !== tool.executionSettingsKey)
            throw new Error(TOOL_SETTINGS_CHANGED_MESSAGE);
        } else if (!approvedInProcess) {
          throw new Error(TOOL_SETTINGS_CHANGED_MESSAGE);
        }
      }
      if (tool.failureGroup && failedGroups.has(tool.failureGroup))
        throw new Error('This tool group stopped after an earlier failure.');
      return resultWithDetails(tool, await runResolvedTool(tool, input, turnId, api, context));
    } finally {
      admittedInProcess.delete(approvalId);
    }
  }

  async function runResolvedTool(
    tool: RuntimeTool,
    input: RuntimeJsonValue,
    turnId: string,
    api: ToolExecutionApi,
    context: Context,
    answer?: RuntimeJsonValue,
  ): Promise<RuntimeToolResult> {
    const signal = requireSignal(context);
    signal.throwIfAborted();
    const task = await api.getTask(api.taskId, context);
    const taskInput = task?.input as ToolTaskInput | undefined;
    const deadlineDoc =
      taskInput?.kind === 'nested'
        ? await api.snapshot(PiCodemodeDeadlineDoc, taskInput.parent, context)
        : undefined;
    const deadline = deadlineDoc?.deadline;
    signal.throwIfAborted();
    const remaining = deadline !== undefined ? deadline - api.now() : undefined;
    if (remaining !== undefined && remaining <= 0) {
      throw new Error('Script timed out before this tool call could run.');
    }
    let deadlineController: AbortController | undefined;
    let forceTimeoutController: AbortController | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let onParentAbort: (() => void) | undefined;
    if (deadline !== undefined) {
      const timeoutError = Object.assign(
        new Error(
          tool.effect !== 'read'
            ? 'Script timed out while this tool call was running. The outcome could not be confirmed; check before retrying.'
            : 'Script timed out while this tool call was running.',
        ),
        { code: 'script_timeout', retryable: tool.effect === 'read' },
      );
      deadlineController = new AbortController();
      forceTimeoutController = new AbortController();
      onParentAbort = () => {
        deadlineController?.abort(signal.reason);
        forceTimeoutController?.abort(signal.reason);
      };
      if (signal.aborted) onParentAbort();
      else signal.addEventListener('abort', onParentAbort, { once: true });
      if (
        !deadlineController.signal.aborted &&
        remaining !== undefined &&
        remaining <= 0x7fffffff
      ) {
        deadlineTimer = setTimeout(() => {
          deadlineController?.abort(timeoutError);
          // Let signal-aware tools (such as MCP adapters) classify whether a write was sent
          // before forcing settlement for tools that ignore AbortSignal.
          graceTimer = setTimeout(() => {
            forceTimeoutController?.abort(timeoutError);
          }, SCRIPT_TIMEOUT_SETTLE_GRACE_MS);
        }, remaining);
      }
    }
    const executionSignal = deadlineController?.signal ?? signal;
    const raceSignal = forceTimeoutController?.signal ?? signal;
    const cleanupGuards = () => {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      if (onParentAbort !== undefined) signal.removeEventListener('abort', onParentAbort);
    };
    try {
      let result: RuntimeToolResult;
      try {
        result = await raceAbort(
          tool.execute({
            input,
            signal: executionSignal,
            toolCallId: api.callId,
            turnId,
            ...(answer !== undefined ? { answer } : {}),
          }),
          raceSignal,
        );
        // Do not discard an already-completed tool result if only the script deadline elapsed.
        signal.throwIfAborted();
      } finally {
        cleanupGuards();
      }
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
        if (taskInput?.kind === 'nested') {
          if (tool.ref.source === 'mcp') {
            const ref = tool.ref;
            await api.commit(
              (tx) =>
                tx.appendEntry(PiCodemodeMcpResultEntry, api.conversationId, {
                  data: {
                    parentCallId: taskInput.parentCallId,
                    callId: api.callId,
                    ref,
                    providerName: tool.providerName,
                    displayName: tool.displayName,
                    input: RuntimeJsonValueSchema.parse(taskInput.call.arguments),
                    output: RuntimeJsonValueSchema.parse(stored),
                  },
                }),
              context,
            );
          }
          await retainPiCodemodeArtifacts(
            api,
            taskInput.parent,
            taskInput.parentCallId,
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

  async function executeQuestion(
    template: RuntimeTool,
    args: unknown,
    api: ToolExecutionApi,
    context: Context,
    durable: NonNullable<PiDurableToolOptions['durableInteractions']>,
  ): Promise<ToolExecutionResult | ToolPark> {
    const parsedInput = RuntimeJsonValueSchema.parse(args);
    const key = api.callId;
    const task = await api.getTask(api.taskId, context);
    const taskInput = task?.input as ToolTaskInput | undefined;
    const codemodeParentId = taskInput?.kind === 'nested' ? taskInput.parent : undefined;
    const deadlineDoc =
      codemodeParentId !== undefined
        ? await api.snapshot(PiCodemodeDeadlineDoc, codemodeParentId, context)
        : undefined;
    const deadline = deadlineDoc?.deadline;
    if (deadline !== undefined && api.now() >= deadline) {
      const existing = await api.snapshot(PiPendingQuestionsDoc, api.conversationId, context);
      if (existing?.items[key]?.taskId === Number(api.taskId)) await clearQuestion(api, context);
      throw new Error('Script timed out before the question was answered.');
    }
    const completeAnswer = async (value: unknown): Promise<ToolExecutionResult | ToolPark> => {
      const parsedAnswer = RuntimeJsonValueSchema.parse(value);
      const existing = await api.snapshot(PiPendingQuestionsDoc, api.conversationId, context);
      if (existing?.items[key]?.taskId === Number(api.taskId)) await clearQuestion(api, context);
      let tool: RuntimeTool;
      let turnId: string;
      try {
        ({ tool, turnId } = await resolve(template, api, context));
      } catch (error) {
        if (error instanceof RuntimeToolDiscoveryError) {
          const retry = await scheduleDiscoveryRetry(api, codemodeParentId, context);
          if ('timedOut' in retry) {
            throw new Error('Script timed out before the question was answered.', { cause: error });
          }
          return {
            kind: 'sleep',
            ...(api.checkpoint !== undefined ? { checkpoint: api.checkpoint } : {}),
            until: retry.retryAt,
          };
        }
        throw error;
      }
      if (tool.approval === 'deny') throw new Error('This tool is disabled.');
      const output = await runResolvedTool(tool, parsedInput, turnId, api, context, parsedAnswer);
      return resultWithDetails(tool, output);
    };
    const received = await api.readSignal(UserQuestionAnswerSignal, key, context);
    if (received?.kind === 'value') return completeAnswer(received.value);

    const { tool } = await resolve(template, api, context);
    if (tool.approval === 'deny') throw new Error('This tool is disabled.');
    const question = (
      tool.parseQuestion ? tool.parseQuestion(parsedInput) : parsedInput
    ) as RuntimePendingQuestion['question'];
    const { turnId, requestId } = await durable.identity(api, context);
    const outcome = await api.commit<'parked' | 'answered' | 'conflict' | 'timed_out'>(
      async (tx) => {
        const task = await tx.task(api.taskId);
        const pending = await tx.doc(PiPendingQuestionsDoc, api.conversationId);
        const live = await tx.doc(LiveDoc, api.conversationId);
        if (deadline !== undefined && api.now() >= deadline) {
          if (pending.items[key]?.taskId === Number(api.taskId)) delete pending.items[key];
          return 'timed_out';
        }
        pruneStaleInteractions(pending.items, live);
        if (hasCommittedTaskSignal(task, UserQuestionAnswerSignal.name, key)) {
          if (pending.items[key]?.taskId === Number(api.taskId)) delete pending.items[key];
          return 'answered';
        }
        if (
          Object.values(pending.items).some(
            (item) => item.toolCallId !== key && hasLiveTool(live, item.toolCallId, item.taskId),
          )
        )
          return 'conflict';
        if (durable.hasPendingHostQuestion?.({ turnId, requestId })) return 'conflict';
        const previous = pending.items[key];
        pending.items[key] = {
          taskId: Number(api.taskId),
          key,
          toolCallId: key,
          turnId,
          requestId,
          question,
          requestedAt: previous?.taskId === Number(api.taskId) ? previous.requestedAt : api.now(),
        };
        return 'parked';
      },
      context,
    );
    if (outcome === 'timed_out') {
      throw new Error('Script timed out before the question was answered.');
    }
    if (outcome === 'answered') {
      const latest = await api.readSignal(UserQuestionAnswerSignal, key, context);
      if (latest?.kind === 'value') return completeAnswer(latest.value);
      if (latest?.kind === 'expired')
        throw new Error('Script timed out before the question was answered.');
      throw new Error('The question response could not be read.');
    }
    if (outcome !== 'parked')
      return resultWithDetails(
        template,
        createCallErrorToolResult({
          code: 'question_already_pending',
          message: 'Wait for the current question before asking another.',
          origin: 'tool',
          retryable: false,
        }),
      );
    if (task?.owner !== undefined) codemodeRuns.get(Number(task.owner))?.(api.taskId);
    return {
      kind: 'sleep',
      checkpoint: { question },
      signals: [UserQuestionAnswerSignal.key(key)],
      ...(deadline !== undefined ? { until: deadline } : {}),
    };
  }

  const tools = options.tools
    .filter((tool) => tool.approval !== 'deny' && tool !== scriptCapability)
    .map((tool) => {
      const durableQuestion =
        interactions &&
        tool.ref.source === 'builtin' &&
        tool.ref.capabilityId === DURABLE_QUESTION_TOOL_NAME;
      return defineTool({
        name: tool.providerName,
        description: tool.description,
        parameters: toolParameters(tool),
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
        },
        ...(tool.ref.source === 'mcp' || tool.deferred ? { deferred: true as const } : {}),
        replay: durableQuestion ? 'safe' : 'unsafe',
        async execute(args: unknown, api: ToolExecutionApi, context: Context) {
          if (durableQuestion && interactions)
            return executeQuestion(tool, args, api, context, interactions);
          return execute(tool, RuntimeJsonValueSchema.parse(args), api, context);
        },
        ...(durableQuestion
          ? {
              cancel: (_args: unknown, api: ToolExecutionApi, context: Context) =>
                clearQuestion(api, context),
            }
          : {}),
      });
    });

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

          const parentSignal = requireSignal(context);
          const runController = new AbortController();
          const onParentAbort = () => runController.abort(parentSignal.reason);
          if (parentSignal.aborted) onParentAbort();
          else parentSignal.addEventListener('abort', onParentAbort, { once: true });

          let finished = false;
          let started = false;
          let vmIdle = false;
          let launching = 0;
          let commitsInFlight = 0;
          let queuedOutcomes = 0;
          let journalEntriesCount = 0;
          let journalIssuedCount = 0;
          const replayedKeys = new Set<string>();
          const activeChildren = new Set<TaskId>();
          const parkedChildren = new Set<TaskId>();
          let parkTimer: ReturnType<typeof setTimeout> | undefined;

          const canPark = () =>
            !finished &&
            vmIdle &&
            !runController.signal.aborted &&
            launching === 0 &&
            commitsInFlight === 0 &&
            queuedOutcomes === 0 &&
            activeChildren.size > 0 &&
            activeChildren.size === parkedChildren.size &&
            journalEntriesCount + parkedChildren.size === journalIssuedCount;

          const schedulePark = () => {
            if (parkTimer !== undefined || !canPark()) return;
            parkTimer = setTimeout(() => {
              parkTimer = undefined;
              if (canPark()) runController.abort(CODEMODE_PARK_REASON);
            }, 0);
          };

          const parkForChild = (childTaskId: TaskId) => {
            parkedChildren.add(childTaskId);
            schedulePark();
          };
          const parentTaskId = Number(api.taskId);
          codemodeRuns.set(parentTaskId, parkForChild);

          const wrappedApi: ToolExecutionApi = {
            ...api,
            commit: (async (change, commitContext, commitOptions) => {
              commitsInFlight += 1;
              const flushedOutcomes = queuedOutcomes;
              let journalBatchDelta: number | undefined;
              let journalCaughtUp = false;
              let nextJournalEntriesCount = 0;
              let nextJournalIssuedCount = 0;
              const observedChange: typeof change = async (tx) => {
                journalBatchDelta = undefined;
                journalCaughtUp = false;
                nextJournalEntriesCount = 0;
                nextJournalIssuedCount = 0;
                let journalDoc:
                  | { firstIssued?: number; entries: { issuedAfter?: number }[] }
                  | undefined;
                let beforeEntries = 0;
                const deadlineDoc = !started
                  ? await tx.doc(PiCodemodeDeadlineDoc, api.taskId)
                  : undefined;
                const wrappedTx = new Proxy(tx, {
                  get(target, prop) {
                    if (prop === 'doc') {
                      return async (...docArgs: Parameters<Tx['doc']>) => {
                        const doc = await target.doc(...docArgs);
                        const token = docArgs[0] as { definition?: { kind?: unknown } } | undefined;
                        if (
                          started &&
                          token?.definition?.kind === 'pi.codemode.journal' &&
                          doc &&
                          typeof doc === 'object' &&
                          'entries' in doc &&
                          Array.isArray(doc.entries)
                        ) {
                          journalDoc = doc as {
                            firstIssued?: number;
                            entries: { issuedAfter?: number }[];
                          };
                          beforeEntries = journalDoc.entries.length;
                        }
                        return doc;
                      };
                    }
                    const value = Reflect.get(target, prop, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                  },
                });
                const outcome = await change(wrappedTx);
                if (
                  deadlineDoc !== undefined &&
                  typeof outcome === 'object' &&
                  outcome !== null &&
                  'kind' in outcome &&
                  outcome.kind === 'started' &&
                  'start' in outcome &&
                  typeof outcome.start === 'object' &&
                  outcome.start !== null &&
                  'deadline' in outcome.start &&
                  typeof outcome.start.deadline === 'number' &&
                  deadlineDoc.deadline !== outcome.start.deadline
                ) {
                  deadlineDoc.deadline = outcome.start.deadline;
                }
                if (journalDoc !== undefined) {
                  const { entries, firstIssued } = journalDoc;
                  journalBatchDelta = entries.length - beforeEntries;
                  nextJournalEntriesCount = entries.length;
                  nextJournalIssuedCount = entries.reduce(
                    (max, entry) => Math.max(max, entry.issuedAfter ?? 0),
                    firstIssued ?? 0,
                  );
                  journalCaughtUp =
                    entries.length === 0
                      ? firstIssued !== undefined
                      : entries[entries.length - 1]?.issuedAfter !== undefined;
                }
                return outcome;
              };
              let commitFailed = false;
              try {
                const committed = await api.commit(observedChange, commitContext, commitOptions);
                if (
                  !started &&
                  typeof committed === 'object' &&
                  committed !== null &&
                  'kind' in committed &&
                  committed.kind === 'started' &&
                  'journal' in committed &&
                  Array.isArray(committed.journal)
                ) {
                  started = true;
                  const startupFirstIssued = (committed as { firstIssued?: number }).firstIssued;
                  journalEntriesCount = committed.journal.length;
                  journalIssuedCount = (committed.journal as { issuedAfter?: number }[]).reduce(
                    (max, entry) => Math.max(max, entry.issuedAfter ?? 0),
                    startupFirstIssued ?? 0,
                  );
                  for (const entry of committed.journal) {
                    if (
                      typeof entry === 'object' &&
                      entry !== null &&
                      typeof (entry as { id?: unknown }).id === 'number' &&
                      (entry as { global?: unknown }).global === undefined
                    ) {
                      replayedKeys.add(`c${(entry as { id: number }).id}`);
                    }
                  }
                } else if (journalBatchDelta !== undefined) {
                  journalEntriesCount = nextJournalEntriesCount;
                  journalIssuedCount = nextJournalIssuedCount;
                  vmIdle = journalBatchDelta === 0 && journalCaughtUp;
                }
                queuedOutcomes -= flushedOutcomes;
                return committed;
              } catch (error) {
                commitFailed = true;
                if (parkTimer !== undefined) {
                  clearTimeout(parkTimer);
                  parkTimer = undefined;
                }
                throw error;
              } finally {
                commitsInFlight -= 1;
                if (!commitFailed) schedulePark();
              }
            }) as ToolExecutionApi['commit'],
            executeTool: (async (
              name: string,
              toolArgs: Record<string, JsonValue>,
              callContext: Context,
              execOptions?: Parameters<ToolExecutionApi['executeTool']>[3],
            ) => {
              if (execOptions?.wait === false) {
                return api.executeTool(name, toolArgs, callContext, execOptions);
              }
              const replayed =
                execOptions?.key !== undefined && replayedKeys.delete(execOptions.key);
              launching += 1;
              let handle: NestedToolCall;
              let childTaskId: TaskId | undefined;
              try {
                handle = await api.executeTool(name, toolArgs, callContext, {
                  ...execOptions,
                  wait: false,
                });
                childTaskId = handle.taskId;
                activeChildren.add(childTaskId);
                const child = await api.getTask(childTaskId, context);
                if (child?.state.status === 'sleeping') parkForChild(childTaskId);
              } finally {
                launching -= 1;
                schedulePark();
              }
              try {
                const outcome = await handle.result(callContext);
                activeChildren.delete(childTaskId);
                parkedChildren.delete(childTaskId);
                if (!replayed) queuedOutcomes += 1;
                return outcome;
              } catch (error) {
                activeChildren.delete(childTaskId);
                if (runController.signal.reason !== CODEMODE_PARK_REASON)
                  parkedChildren.delete(childTaskId);
                throw error;
              }
            }) as ToolExecutionApi['executeTool'],
          };

          let result: ToolExecutionResult | undefined;
          let parked: ToolPark | undefined;
          try {
            await current.execute({
              input: RuntimeJsonValueSchema.parse(args),
              signal: runController.signal,
              toolCallId: api.callId,
              turnId,
              run: async () => {
                try {
                  const outcome = await tool.execute(
                    args,
                    wrappedApi,
                    withAbortSignal(runController.signal, context),
                  );
                  finished = true;
                  if (outcome.kind !== undefined)
                    throw new Error('The JavaScript tool cannot park.');
                  result = outcome;
                  const value: RuntimeJsonValue = result.isError
                    ? { status: 'error', code: piCodemodeFailureCode(result) }
                    : { status: 'ok' };
                  return { value, artifacts: [] };
                } catch (error) {
                  if (
                    !parentSignal.aborted &&
                    runController.signal.aborted &&
                    runController.signal.reason === CODEMODE_PARK_REASON &&
                    parkedChildren.size > 0
                  ) {
                    parked = { kind: 'wait', on: [...parkedChildren], policy: 'any' };
                    return { value: { status: 'parked' }, artifacts: [] };
                  }
                  throw error;
                }
              },
            });
          } finally {
            finished = true;
            if (parkTimer !== undefined) clearTimeout(parkTimer);
            codemodeRuns.delete(parentTaskId);
            parentSignal.removeEventListener('abort', onParentAbort);
          }
          if (parked) return parked;
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
          const key = call.id;
          const id = toolApprovalId(api, key);
          const blocked = await options.beforeCall?.(call, api, context);
          if (blocked) return { block: blocked };
          const template =
            call.name === CODEMODE_TOOL_NAME && codemode
              ? scriptCapability
              : catalog.get(call.name);
          // Upstream discovery and Code Mode have no application-side effect to approve.
          if (!template) return;
          const clearPendingItem = async () => {
            if (!interactions) return;
            const existing = await api.snapshot(PiPendingApprovalsDoc, api.conversationId, context);
            if (existing?.items[id]?.taskId !== Number(api.taskId)) return;
            await interactions.commit(async (tx) => {
              const pending = await tx.doc(PiPendingApprovalsDoc, api.conversationId);
              if (pending.items[id]?.taskId === Number(api.taskId)) delete pending.items[id];
            }, context);
          };
          let target: RuntimeTool;
          let templateSettingsDrifted = false;
          try {
            ({ tool: target, settingsDrifted: templateSettingsDrifted } = await resolve(
              template,
              api,
              context,
              { allowSettingsDrift: true },
            ));
          } catch (error) {
            if (error instanceof RuntimeToolUnavailableError) {
              await clearPendingItem();
              return { block: error.message };
            }
            if (error instanceof RuntimeToolDiscoveryError && interactions) {
              const [existingPending, received, deadlineDoc] = await Promise.all([
                api.snapshot(PiPendingApprovalsDoc, api.conversationId, context),
                api.readSignal(ToolApprovalSignal, key, context),
                call.parent !== undefined
                  ? api.snapshot(PiCodemodeDeadlineDoc, call.parent.taskId, context)
                  : Promise.resolve(undefined),
              ]);
              const deadline = deadlineDoc?.deadline;
              const pendingItem =
                existingPending && Object.hasOwn(existingPending.items, id)
                  ? existingPending.items[id]
                  : undefined;
              const hasParkedPendingApproval = pendingItem?.taskId === Number(api.taskId);
              if (
                (deadline !== undefined && api.now() >= deadline) ||
                received?.kind === 'expired'
              ) {
                await clearPendingItem();
                return { block: 'Script timed out before this tool call could run.' };
              }
              if (received?.kind === 'value') {
                const decision = ToolApprovalDecisionSchema.parse(received.value);
                await clearPendingItem();
                if (decision.decision !== 'approve') {
                  return { block: 'The user denied this tool call.' };
                }
                if (
                  template.executionSettingsKey !== undefined &&
                  decision.executionSettingsKey !== template.executionSettingsKey
                ) {
                  return {
                    block:
                      'Tool settings changed since approval was granted. Start a new turn to retry.',
                  };
                }
                const retry = await scheduleDiscoveryRetry(api, call.parent?.taskId, context);
                if ('timedOut' in retry) {
                  return { block: 'Script timed out before this tool call could run.' };
                }
                return {
                  sleep: {
                    until: retry.retryAt,
                  },
                };
              }
              if (hasParkedPendingApproval) {
                if (call.parent !== undefined) {
                  codemodeRuns.get(Number(call.parent.taskId))?.(api.taskId);
                }
                return {
                  sleep: {
                    signals: [ToolApprovalSignal.key(key)],
                    ...(deadline !== undefined ? { until: deadline } : {}),
                  },
                };
              }
            }
            throw error;
          }
          if (target.approval === 'deny') {
            await clearPendingItem();
            return { block: 'This tool is disabled.' };
          }
          if (templateSettingsDrifted) {
            await clearPendingItem();
            if (interactions) {
              const received = await api.readSignal(ToolApprovalSignal, key, context);
              if (received?.kind === 'value') {
                const decision = ToolApprovalDecisionSchema.parse(received.value);
                if (decision.decision !== 'approve') {
                  return { block: 'The user denied this tool call.' };
                }
              }
            }
            return { block: TOOL_SETTINGS_CHANGED_MESSAGE };
          }
          if (target.failureGroup && failedGroups.has(target.failureGroup))
            return { block: 'This tool group stopped after an earlier failure.' };
          if (
            target.requiredInstructions &&
            !(await hasToolInstructions(target.requiredInstructions.key, api, context))
          )
            return { block: target.requiredInstructions.refusal };
          const input = RuntimeJsonValueSchema.parse(call.arguments);
          const requiresApproval =
            target.approval === 'ask' || Boolean(target.requiresApproval?.(input));

          if (interactions) {
            const deadlineDoc =
              call.parent !== undefined
                ? await api.snapshot(PiCodemodeDeadlineDoc, call.parent.taskId, context)
                : undefined;
            const deadline = deadlineDoc?.deadline;
            if (deadline !== undefined && api.now() >= deadline) {
              await clearPendingItem();
              return { block: 'Script timed out before this tool call could run.' };
            }

            const received = await api.readSignal(ToolApprovalSignal, key, context);
            if (!requiresApproval) {
              await clearPendingItem();
              if (received?.kind === 'value') {
                const decision = ToolApprovalDecisionSchema.parse(received.value);
                if (decision.decision !== 'approve') {
                  return { block: 'The user denied this tool call.' };
                }
              }
              return;
            }
            if (received?.kind === 'value') {
              await clearPendingItem();
              if (!isApprovedDecision(received.value, target)) {
                const decision = ToolApprovalDecisionSchema.parse(received.value);
                if (decision.decision !== 'approve') {
                  return { block: 'The user denied this tool call.' };
                }
                return {
                  block:
                    'Tool settings changed since approval was granted. Start a new turn to retry.',
                };
              }
              return;
            }
            const { turnId, requestId } = await interactions.identity(api, context);
            let alreadyResponded = false;
            let timedOutInCommit = false;
            await interactions.commit(async (tx) => {
              alreadyResponded = false;
              timedOutInCommit = false;
              const task = await tx.task(api.taskId);
              const pending = await tx.doc(PiPendingApprovalsDoc, api.conversationId);
              const live = await tx.doc(LiveDoc, api.conversationId);
              if (deadline !== undefined && api.now() >= deadline) {
                if (pending.items[id]?.taskId === Number(api.taskId)) {
                  delete pending.items[id];
                }
                timedOutInCommit = true;
                return;
              }
              const previous = Object.hasOwn(pending.items, id) ? pending.items[id] : undefined;
              pruneStaleInteractions(pending.items, live);
              if (hasCommittedTaskSignal(task, ToolApprovalSignal.name, key)) {
                delete pending.items[id];
                alreadyResponded = true;
                return;
              }
              pending.items[id] = {
                taskId: Number(api.taskId),
                key,
                toolCallId: call.id,
                turnId,
                requestId,
                toolRef: target.ref,
                providerName: target.providerName,
                displayName: target.displayName,
                ...(target.executionSettingsKey !== undefined
                  ? { executionSettingsKey: target.executionSettingsKey }
                  : {}),
                input: target.approvalInput?.(input) ?? input,
                requestedAt: previous?.requestedAt ?? api.now(),
              };
            }, context);
            if (timedOutInCommit) {
              return { block: 'Script timed out before this tool call could run.' };
            }
            if (alreadyResponded) {
              const latest = await api.readSignal(ToolApprovalSignal, key, context);
              if (latest?.kind === 'value') {
                const decision = ToolApprovalDecisionSchema.parse(latest.value);
                if (decision.decision !== 'approve') {
                  return { block: 'The user denied this tool call.' };
                }
                if (!isApprovedDecision(latest.value, target)) {
                  return {
                    block:
                      'Tool settings changed since approval was granted. Start a new turn to retry.',
                  };
                }
                return;
              }
              if (latest?.kind === 'expired')
                return { block: 'Script timed out before this tool call could run.' };
              return { block: TOOL_SETTINGS_CHANGED_MESSAGE };
            }
            if (call.parent !== undefined)
              codemodeRuns.get(Number(call.parent.taskId))?.(api.taskId);
            return {
              sleep: {
                signals: [ToolApprovalSignal.key(key)],
                ...(deadline !== undefined ? { until: deadline } : {}),
              },
            };
          }
          if (!requiresApproval) return;
          if (
            !(await options.approve?.(
              target,
              target.approvalInput?.(input) ?? input,
              call,
              api,
              context,
            ))
          )
            return { block: 'The user denied this tool call.' };
          admittedInProcess.add(id);
        },
        async afterTool(call, result, api, context) {
          admittedInProcess.delete(toolApprovalId(api, call.id));
          discoveryRetries.delete(Number(api.taskId));
          if (interactions) {
            const id = toolApprovalId(api, call.id);
            const [approvals, questions] = await Promise.all([
              api.snapshot(PiPendingApprovalsDoc, api.conversationId, context),
              api.snapshot(PiPendingQuestionsDoc, api.conversationId, context),
            ]);
            const hasApproval = approvals?.items[id] !== undefined;
            const hasQuestion = questions?.items[call.id]?.taskId === api.taskId;
            if (hasApproval || hasQuestion)
              await interactions.commit(async (tx) => {
                if (hasApproval) {
                  const pending = await tx.doc(PiPendingApprovalsDoc, api.conversationId);
                  delete pending.items[id];
                }
                if (hasQuestion) await removeQuestion(tx, api, call.id);
              }, context);
          }
          // The supported hook covers schema and parse failures before they reach scripts or
          // the next model request. Pi retains ownership of validation and its recovery rules.
          if (result.diagnostics?.some((item) => item.code === 'invalid_arguments')) {
            return {
              ...result,
              diagnostics: result.diagnostics.map((item) =>
                item.code === 'invalid_arguments'
                  ? { ...item, message: boundedValidationMessage(item.message) }
                  : item,
              ),
            };
          }
          if (call.name !== CODEMODE_TOOL_NAME || !codemode) return;
          // Harness failures may never have executed the script. Confirmed artifacts have their
          // own transcript receipts, so preserve the original diagnostics and failure details.
          if (result.diagnostics?.some((diagnostic) => diagnostic.severity === 'error')) return;
          const files = await api.snapshot(PiCodemodeFiles, api.taskId, context);
          // Upstream lists each call under its provider name; an MCP alias needs its display name.
          const details = z
            .looseObject({
              calls: z
                .array(
                  z.looseObject({
                    id: z.number().optional(),
                    name: z.string(),
                    status: z.string().optional(),
                  }),
                )
                .optional(),
            })
            .safeParse(result.details);
          const outputBlocks = result.output ?? [];
          const text = outputBlocks
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n');
          const value = RuntimeJsonValueSchema.parse({
            output: text,
            details: details.success
              ? {
                  ...details.data,
                  ...(details.data.calls
                    ? {
                        calls: details.data.calls.map((item) => {
                          const called = catalog.get(item.name);
                          return called?.ref.source === 'mcp'
                            ? { ...item, title: called.displayName }
                            : item;
                        }),
                      }
                    : {}),
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

function toolApprovalId(api: Pick<HookApi, 'taskId'>, callId: string) {
  return `pi:${api.taskId}:${callId}`;
}

async function removeQuestion(
  tx: Tx,
  api: Pick<HookApi, 'conversationId' | 'taskId'>,
  callId: string,
) {
  const pending = await tx.doc(PiPendingQuestionsDoc, api.conversationId);
  if (pending.items[callId]?.taskId === api.taskId) delete pending.items[callId];
}

function clearQuestion(api: ToolExecutionApi, context: Context) {
  return api.commit((tx) => removeQuestion(tx, api, api.callId), context);
}

function boundedValidationMessage(message: string): string {
  // Upstream appends the complete input after this separator. Do not retain it in feedback.
  const diagnostic = message.split('\n\nReceived arguments:', 1)[0];
  const lines = diagnostic.split('\n');
  const issues = lines.filter((line) => line.startsWith('  - '));
  return (
    issues.length > 5
      ? [
          ...lines.filter((line) => !line.startsWith('  - ')),
          ...issues.slice(0, 5),
          `${issues.length - 5} more validation errors omitted.`,
        ].join('\n')
      : diagnostic
  ).slice(0, 2000);
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
                : toModelToolResult(stored).value,
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

function toolParameters(tool: RuntimeTool) {
  const parameters = z.record(z.string(), RuntimeJsonValueSchema).parse(tool.inputSchema);
  // Some compatible endpoints require properties even for a parameterless MCP tool.
  return parameters.type === 'object' &&
    parameters.$ref === undefined &&
    !Object.hasOwn(parameters, 'properties')
    ? { ...parameters, properties: {} }
    : parameters;
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
