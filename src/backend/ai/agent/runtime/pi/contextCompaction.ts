import type { AgentMessage, AgentTool as PiAgentTool } from '@earendil-works/pi-agent-core';
import {
  compact,
  estimateContextTokens,
  estimateTokens,
  prepareCompaction,
  shouldCompact,
  type CompactionPreparation,
  type CompactionSettings,
} from '@earendil-works/pi-agent-core/compaction';
import type {
  Api as PiApi,
  Message as PiLlmMessage,
  Model as PiModel,
  Models,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import type { RuntimeContextCheckpoint, RuntimeContextCompaction } from '../types';
import type { PiConversation, PiHistoryTurn } from './modelMessages';

const PI_CONTEXT_CHECKPOINT_KIND = 'pi-context-compaction';
const PI_ESTIMATED_IMAGE_TOKENS = 1_200;

export const PI_ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const PI_IMAGE_CONTEXT_TOKEN_RESERVE = 4_096;
export const PI_CONTEXT_SAFETY_MARGIN_TOKENS = 1_024;
// Pi's per-request output clamp keeps 4,096 tokens clear of the window before sizing output.
export const PI_OUTPUT_CLAMP_SAFETY_TOKENS = 4_096;
const PI_MIN_ANSWER_TOKENS = 1_024;
// Admission needs room for a usable answer once Pi has fitted the output cap to the input.
export const PI_MIN_OUTPUT_RESERVE_TOKENS =
  PI_OUTPUT_CLAMP_SAFETY_TOKENS - PI_CONTEXT_SAFETY_MARGIN_TOKENS + PI_MIN_ANSWER_TOKENS;
export const PI_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
};

export const CHERRY_COMPACTION_INSTRUCTIONS = `Summarize a general mobile assistant conversation, not a coding workspace.
Preserve user goals, preferences, decisions, unresolved questions, and conclusions needed to continue.
Keep tool calls paired with their outcomes. Do not reproduce attachment bodies, credentials, connection details, or sensitive tool-result payloads; retain only non-sensitive conclusions.`;

export type PiHistoryTokenEstimator = (messages: AgentMessage[]) => number;

export type PiContextFixedCosts = {
  systemInstructionsTokens: number;
  currentInputTokens: number;
  toolSchemaTokens: number;
  attachmentTokens: number;
  outputReserveTokens: number;
  safetyMarginTokens: number;
  totalTokens: number;
};

export type PiContextCompactionOptions = {
  estimateHistoryTokens?: PiHistoryTokenEstimator;
  settings?: CompactionSettings;
};

type PiContextPlanInput = {
  maxInputTokens?: number;
  model: PiModel<PiApi>;
  models: Pick<Models, 'completeSimple'>;
  options?: PiContextCompactionOptions;
  redactSummary: (summary: string) => string;
  signal: AbortSignal;
  thinkingLevel: Parameters<typeof compact>[5];
  tools: readonly PiToolSchema[];
  onCompaction?: (update: PiCompactionUpdate) => void;
};

/** Request context size, separate from accumulated billing usage. */
export type PiContextUsage = {
  inputTokens: number;
  inputTokenLimit: number;
  safetyMarginTokens: number;
};

export type PiCompactionUpdate = Pick<
  RuntimeContextCompaction,
  'status' | 'inputTokensBefore' | 'inputTokensAfter' | 'reason'
>;

export type PiContextPlan =
  | {
      ok: true;
      messages: AgentMessage[];
      checkpoint: RuntimeContextCheckpoint | null;
      usage: PiUsage | null;
    }
  | {
      ok: false;
      code: 'context_window_exceeded' | 'context_compaction_failed';
      message: string;
      retryable: boolean;
    };

type PiCheckpointPayload = {
  kind: typeof PI_CONTEXT_CHECKPOINT_KIND;
  summary: string;
  tokensBefore: number;
  resume?: {
    turnId: string;
    messageOffset: number;
  };
};

type MessageMetadata = {
  turnId: string | null;
  turnIndex: number;
  messageOffset: number;
};

type CompactionEntries = Parameters<typeof prepareCompaction>[0];

type ProjectedContext = {
  checkpoint: RuntimeContextCheckpoint | null;
  entries: CompactionEntries;
  messages: AgentMessage[];
  metadata: WeakMap<object, MessageMetadata>;
};

type PiToolSchema = Pick<PiAgentTool, 'name' | 'description' | 'parameters'>;

function estimatePiNonMessageContextCosts(input: {
  imageMessages: readonly AgentMessage[];
  outputReserveTokens: number;
  systemPrompt: string;
  tools: readonly PiToolSchema[];
}) {
  const systemInstructionsTokens = estimateTextTokens(input.systemPrompt);
  const toolSchemaTokens = input.tools.reduce(
    (total, tool) => total + estimateTextTokens(serializeTool(tool)),
    0,
  );
  const imageCount = input.imageMessages.reduce(
    (total, message) => total + countImages(message),
    0,
  );
  const attachmentTokens =
    imageCount * Math.max(0, PI_IMAGE_CONTEXT_TOKEN_RESERVE - PI_ESTIMATED_IMAGE_TOKENS);
  const outputReserveTokens = Math.max(0, input.outputReserveTokens);
  const safetyMarginTokens = PI_CONTEXT_SAFETY_MARGIN_TOKENS;
  return {
    systemInstructionsTokens,
    toolSchemaTokens,
    attachmentTokens,
    outputReserveTokens,
    safetyMarginTokens,
    totalTokens:
      systemInstructionsTokens +
      toolSchemaTokens +
      attachmentTokens +
      outputReserveTokens +
      safetyMarginTokens,
  };
}

export function estimatePiMessagesTokens(messages: AgentMessage[]): number {
  return estimatePiContextTokens(messages).tokens;
}

/** Keep provider measurements intact; correct only content not covered by their usage. */
function estimatePiContextTokens(messages: AgentMessage[]) {
  const estimate = estimateContextTokens(messages);
  const unmeasured = messages.slice((estimate.lastUsageIndex ?? -1) + 1);
  const trailingTokens = unmeasured.reduce(
    (total, message) => total + estimatePiMessageTokens(message),
    0,
  );
  return { ...estimate, trailingTokens, tokens: estimate.usageTokens + trailingTokens };
}

/** Content only, even if an assistant message carries usage for an entire request. */
export function estimatePiMessageTokens(message: AgentMessage): number {
  let reserve = 0;
  if (message.role === 'compactionSummary' || message.role === 'branchSummary') {
    reserve = nonAsciiTokenReserve(message.summary);
  } else if ('content' in message) {
    reserve =
      typeof message.content === 'string'
        ? nonAsciiTokenReserve(message.content)
        : message.content.reduce((sum, part) => {
            if (part.type === 'text') return sum + nonAsciiTokenReserve(part.text);
            if (part.type === 'thinking') return sum + nonAsciiTokenReserve(part.thinking);
            if (part.type === 'toolCall')
              return sum + nonAsciiTokenReserve(part.name + safeJsonStringify(part.arguments));
            return sum;
          }, 0);
  }
  return Math.ceil(estimateTokens(message) + reserve);
}

/** Remaining room for model-loop messages before another provider request. */
export function estimatePiLoopContextHeadroomTokens(input: {
  contextWindow: number;
  maxInputTokens?: number;
  messages: AgentMessage[];
  outputReserveTokens: number;
  systemPrompt: string;
  tools: readonly PiToolSchema[];
}): number {
  const usage = measurePiContext(input);
  return usage.inputTokenLimit - usage.inputTokens;
}

export function measurePiContext(input: {
  contextWindow: number;
  maxInputTokens?: number;
  messages: AgentMessage[];
  outputReserveTokens: number;
  systemPrompt: string;
  tools: readonly PiToolSchema[];
}): PiContextUsage {
  const estimate = estimatePiContextTokens(input.messages);
  const unmeasuredMessages =
    estimate.lastUsageIndex === null
      ? input.messages
      : input.messages.slice(estimate.lastUsageIndex + 1);
  const addedToolNames = new Set(
    unmeasuredMessages.flatMap((message) =>
      message.role === 'toolResult' ? (message.addedToolNames ?? []) : [],
    ),
  );
  const fixedCosts = estimatePiNonMessageContextCosts({
    imageMessages: unmeasuredMessages,
    outputReserveTokens: input.outputReserveTokens,
    // Live usage already covers the system prompt, tool definitions, and old images.
    systemPrompt: estimate.lastUsageIndex === null ? input.systemPrompt : '',
    tools:
      estimate.lastUsageIndex === null
        ? input.tools
        : input.tools.filter((tool) => addedToolNames.has(tool.name)),
  });

  return {
    inputTokens:
      estimate.tokens +
      fixedCosts.totalTokens -
      fixedCosts.outputReserveTokens -
      fixedCosts.safetyMarginTokens,
    inputTokenLimit: Math.max(
      0,
      resolveContextBudget(input) - fixedCosts.outputReserveTokens - fixedCosts.safetyMarginTokens,
    ),
    safetyMarginTokens: fixedCosts.safetyMarginTokens,
  };
}

/** Fixed costs include output once; an independent input cap does not reserve it again. */
function resolveContextBudget(input: {
  contextWindow: number;
  maxInputTokens?: number;
  outputReserveTokens: number;
}): number {
  return Math.min(
    input.contextWindow,
    input.maxInputTokens === undefined
      ? input.contextWindow
      : Math.max(0, input.maxInputTokens) + Math.max(0, input.outputReserveTokens),
  );
}

export function estimatePiContextFixedCosts(input: {
  conversation: PiConversation;
  outputReserveTokens: number;
  tools: readonly PiToolSchema[];
}): PiContextFixedCosts {
  const currentMessages = [input.conversation.prompt, ...(input.conversation.resume ?? [])];
  const currentInputTokens = estimatePiMessagesTokens(currentMessages);
  const fixedCosts = estimatePiNonMessageContextCosts({
    imageMessages: currentMessages,
    outputReserveTokens: input.outputReserveTokens,
    systemPrompt: input.conversation.systemPrompt,
    tools: input.tools,
  });
  return {
    ...fixedCosts,
    currentInputTokens,
    totalTokens: fixedCosts.totalTokens + currentInputTokens,
  };
}

export async function planPiContext(
  input: PiContextPlanInput & {
    checkpoint: RuntimeContextCheckpoint | null;
    conversation: PiConversation;
  },
): Promise<PiContextPlan> {
  return planProjectedContext({
    ...input,
    projected: projectContext(input.checkpoint, input.conversation.historyTurns),
    historyTurns: input.conversation.historyTurns,
    // A retry's retained prefix belongs to the turn being produced, not to
    // completed history, so it is never a compaction candidate.
    currentMessages: [input.conversation.prompt, ...(input.conversation.resume ?? [])],
    systemPrompt: input.conversation.systemPrompt,
  });
}

/** Live Pi messages cannot supply durable offsets into the application transcript. */
export async function planPiLoopContext(
  input: PiContextPlanInput & {
    messages: AgentMessage[];
    systemPrompt: string;
  },
): Promise<PiContextPlan> {
  const entries: CompactionEntries = input.messages.map((message, index) => ({
    id: `live:${index}`,
    parentId: index === 0 ? null : `live:${index - 1}`,
    seq: index,
    timestamp: message.timestamp,
    ...(message.role === 'compactionSummary'
      ? {
          type: 'compaction' as const,
          summary: message.summary,
          tokensBefore: message.tokensBefore,
          retainedTail: [],
        }
      : { type: 'message' as const, message }),
  }));
  return planProjectedContext({
    ...input,
    projected: { checkpoint: null, entries, messages: input.messages, metadata: new WeakMap() },
    historyTurns: [],
  });
}

async function planProjectedContext(
  input: PiContextPlanInput & {
    projected: ProjectedContext;
    historyTurns: PiHistoryTurn[];
    /** Current-turn messages: the prompt, plus any retained retry prefix. */
    currentMessages?: AgentMessage[];
    systemPrompt: string;
  },
): Promise<PiContextPlan> {
  const { projected } = input;
  const contextBudget = resolveContextBudget({
    contextWindow: input.model.contextWindow,
    maxInputTokens: input.maxInputTokens,
    outputReserveTokens: PI_MIN_OUTPUT_RESERVE_TOKENS,
  });
  const settings =
    input.options?.settings ??
    resolveCompactionSettings(
      Math.min(input.model.contextWindow, input.maxInputTokens ?? input.model.contextWindow),
    );
  const currentMessages = input.currentMessages ?? [];
  const fixedCosts = estimatePiNonMessageContextCosts({
    imageMessages: currentMessages,
    outputReserveTokens: PI_MIN_OUTPUT_RESERVE_TOKENS,
    systemPrompt: input.systemPrompt,
    tools: input.tools,
  });

  if (fixedCosts.totalTokens + estimatePiMessagesTokens(currentMessages) > contextBudget) {
    return {
      ok: false,
      code: 'context_window_exceeded',
      message: 'The current input exceeds the model context window.',
      retryable: false,
    };
  }

  const measure = (messages: AgentMessage[]) =>
    measurePiContext({
      contextWindow: input.model.contextWindow,
      maxInputTokens: input.maxInputTokens,
      messages: [...messages, ...currentMessages],
      outputReserveTokens: PI_MIN_OUTPUT_RESERVE_TOKENS,
      systemPrompt: input.systemPrompt,
      tools: input.tools,
    });
  const before = measure(projected.messages);
  if (input.options?.estimateHistoryTokens) {
    before.inputTokens +=
      Math.max(0, input.options.estimateHistoryTokens(projected.messages)) -
      estimatePiMessagesTokens(projected.messages);
    before.inputTokens = Math.max(0, before.inputTokens);
  }
  const canSendWithoutCompaction = before.inputTokens <= before.inputTokenLimit;
  const unchanged: PiContextPlan = {
    ok: true,
    messages: projected.messages,
    checkpoint: null,
    usage: null,
  };
  const overflow: PiContextPlan = {
    ok: false,
    code: 'context_window_exceeded',
    message: 'The conversation exceeds the model context window.',
    retryable: false,
  };
  const compactionWindow = Math.min(
    input.model.contextWindow,
    input.maxInputTokens ?? input.model.contextWindow,
  );
  // A small window must still reach compaction before the hard limit rejects the request.
  const triggerSettings = {
    ...settings,
    reserveTokens: Math.max(settings.reserveTokens, PI_MIN_OUTPUT_RESERVE_TOKENS),
  };
  if (
    !shouldCompact(
      before.inputTokens + before.safetyMarginTokens,
      compactionWindow,
      triggerSettings,
    )
  ) {
    return canSendWithoutCompaction ? unchanged : overflow;
  }

  const lastCallIndex = projected.messages.findLastIndex((message) => message.role === 'assistant');
  // A cut inside the newest result has no following assistant boundary. Keep
  // that whole batch so Pi can cut before it instead of retaining all history.
  const newestBatchTokens =
    projected.messages.at(-1)?.role === 'toolResult' && lastCallIndex >= 0
      ? projected.messages
          .slice(lastCallIndex)
          .reduce((total, message) => total + estimateTokens(message), 0) + 1
      : 0;
  const preparation = prepareCompaction(projected.entries, {
    ...settings,
    keepRecentTokens: Math.max(settings.keepRecentTokens, newestBatchTokens),
  });
  if (!preparation.ok) {
    if (canSendWithoutCompaction) return unchanged;
    return {
      ok: false,
      code: 'context_compaction_failed',
      message: 'The conversation context could not be prepared for compaction.',
      retryable: false,
    };
  }
  if (
    !preparation.value ||
    (preparation.value.messagesToSummarize.length === 0 &&
      preparation.value.turnPrefixMessages.length === 0)
  ) {
    return canSendWithoutCompaction ? unchanged : overflow;
  }

  const cherryPreparation: CompactionPreparation = {
    ...preparation.value,
    fileOps: { read: new Set(), written: new Set(), edited: new Set() },
  };
  // Pi skips previousSummary when a split turn has no complete older turns.
  // Carry it as summary content so repeated loop compactions keep earlier goals.
  const summaryPreparation =
    cherryPreparation.isSplitTurn &&
    cherryPreparation.messagesToSummarize.length === 0 &&
    cherryPreparation.previousSummary
      ? {
          ...cherryPreparation,
          messagesToSummarize: [createCompactionSummary(cherryPreparation.previousSummary, 0)],
          previousSummary: undefined,
        }
      : cherryPreparation;
  // The retained tail is sent verbatim. When it alone overflows, a summary
  // cannot make the request fit, so do not pay for one.
  if (!canSendWithoutCompaction) {
    const retained = measure(withoutPrefixUsage(cherryPreparation.retainedTail));
    if (retained.inputTokens > retained.inputTokenLimit) return overflow;
  }
  const report = (
    status: RuntimeContextCompaction['status'],
    reason?: RuntimeContextCompaction['reason'],
    inputTokensAfter?: number,
  ) => {
    input.onCompaction?.({
      status,
      inputTokensBefore: before.inputTokens,
      ...(reason ? { reason } : {}),
      ...(inputTokensAfter === undefined ? {} : { inputTokensAfter }),
    });
  };
  report('running');
  let result: Awaited<ReturnType<typeof compact>>;
  try {
    result = await compact(
      summaryPreparation,
      input.models as Models,
      input.model,
      CHERRY_COMPACTION_INSTRUCTIONS,
      input.signal,
      input.thinkingLevel,
    );
  } catch (error) {
    report(
      input.signal.aborted ? 'cancelled' : 'failed',
      input.signal.aborted ? 'cancelled' : 'summary-failed',
    );
    input.signal.throwIfAborted();
    if (canSendWithoutCompaction) return unchanged;
    throw error;
  }
  if (input.signal.aborted) {
    report('cancelled', 'cancelled');
    input.signal.throwIfAborted();
  }
  if (!result.ok) {
    report(
      result.error.code === 'aborted' ? 'cancelled' : 'failed',
      result.error.code === 'aborted' ? 'cancelled' : 'summary-failed',
    );
    if (result.error.code !== 'aborted' && canSendWithoutCompaction) return unchanged;
    return {
      ok: false,
      code: 'context_compaction_failed',
      message:
        result.error.code === 'aborted'
          ? 'Context compaction was cancelled.'
          : 'The conversation context could not be compacted.',
      retryable: result.error.code !== 'aborted',
    };
  }

  const summary = input.redactSummary(result.value.summary);
  const messages = [
    createCompactionSummary(summary, result.value.tokensBefore),
    ...withoutPrefixUsage(result.value.retainedTail),
  ];
  const after = measure(messages);
  if (after.inputTokens > after.inputTokenLimit || after.inputTokens >= before.inputTokens) {
    report('failed', 'insufficient-reduction');
    if (canSendWithoutCompaction) return unchanged;
    return {
      ok: false,
      code: 'context_window_exceeded',
      message: 'The compacted conversation exceeds the model input budget.',
      retryable: false,
    };
  }
  const checkpoint = createCheckpoint(
    projected.checkpoint,
    input.historyTurns,
    cherryPreparation,
    projected.metadata,
    summary,
    result.value.tokensBefore,
  );
  report('completed', undefined, after.inputTokens);
  return {
    ok: true,
    messages,
    checkpoint,
    usage: result.value.usage ?? null,
  };
}

function resolveCompactionSettings(contextWindow: number): CompactionSettings {
  return {
    ...PI_COMPACTION_SETTINGS,
    reserveTokens: Math.min(
      PI_COMPACTION_SETTINGS.reserveTokens,
      Math.max(1, Math.floor(contextWindow * 0.2)),
    ),
    keepRecentTokens: Math.min(
      PI_COMPACTION_SETTINGS.keepRecentTokens,
      Math.max(1, Math.floor(contextWindow * 0.25)),
    ),
  };
}

function projectContext(
  checkpoint: RuntimeContextCheckpoint | null,
  historyTurns: PiHistoryTurn[],
): ProjectedContext {
  const payload = parseCheckpointPayload(checkpoint?.payload);
  const entries: CompactionEntries = [];
  const messages: AgentMessage[] = [];
  const metadata = new WeakMap<object, MessageMetadata>();
  let parentId: string | null = null;
  let seq = 0;

  if (payload && checkpoint) {
    const entryId = `checkpoint:${checkpoint.anchorTurnId}`;
    entries.push({
      type: 'compaction',
      id: entryId,
      parentId,
      seq: seq++,
      timestamp: 0,
      summary: payload.summary,
      retainedTail: [],
      tokensBefore: payload.tokensBefore,
    });
    parentId = entryId;
    messages.push(createCompactionSummary(payload.summary, payload.tokensBefore));
  }

  let resumeApplied = payload?.resume === undefined;
  for (const [turnIndex, turn] of historyTurns.entries()) {
    let turnMessages = turn.messages as AgentMessage[];
    let sourceOffset = 0;
    if (!resumeApplied) {
      if (turn.turnId !== payload?.resume?.turnId) continue;
      sourceOffset = payload.resume.messageOffset;
      if (sourceOffset > turnMessages.length) {
        sourceOffset = 0;
      }
      turnMessages = turnMessages.slice(sourceOffset);
      resumeApplied = true;
    }

    for (const [relativeOffset, message] of turnMessages.entries()) {
      const messageOffset = sourceOffset + relativeOffset;
      const entryId = `turn:${turn.turnId ?? 'legacy'}:${turnIndex}:${messageOffset}`;
      entries.push({
        type: 'message',
        id: entryId,
        parentId,
        seq: seq++,
        timestamp: message.timestamp,
        message,
      });
      parentId = entryId;
      messages.push(message);
      metadata.set(message as object, { turnId: turn.turnId, turnIndex, messageOffset });
    }
  }

  if (!resumeApplied) {
    return projectContext(null, historyTurns);
  }
  return { checkpoint: payload ? checkpoint : null, entries, messages, metadata };
}

function createCheckpoint(
  previous: RuntimeContextCheckpoint | null,
  historyTurns: PiHistoryTurn[],
  preparation: CompactionPreparation,
  metadata: WeakMap<object, MessageMetadata>,
  summary: string,
  tokensBefore: number,
): RuntimeContextCheckpoint | null {
  const summarizedMetadata = preparation.messagesToSummarize.flatMap((message) => {
    const value = metadata.get(message as object);
    return value ? [value] : [];
  });
  const lastSummarized = summarizedMetadata.at(-1);
  let anchorTurnId = lastSummarized?.turnId ?? previous?.anchorTurnId ?? null;
  let resume: PiCheckpointPayload['resume'];

  if (preparation.isSplitTurn) {
    const retainedMetadata = preparation.retainedTail.flatMap((message) => {
      const value = metadata.get(message as object);
      return value ? [value] : [];
    });
    const prefixMetadata = preparation.turnPrefixMessages.flatMap((message) => {
      const value = metadata.get(message as object);
      return value ? [value] : [];
    });
    const splitTurn = retainedMetadata[0] ?? prefixMetadata[0];
    if (!splitTurn?.turnId) return null;
    const previousTurn = findPreviousDurableTurn(historyTurns, splitTurn.turnIndex);
    anchorTurnId = previousTurn?.turnId ?? previous?.anchorTurnId ?? null;
    if (!anchorTurnId) return null;
    resume = { turnId: splitTurn.turnId, messageOffset: splitTurn.messageOffset };
  } else if (lastSummarized?.turnId === null) {
    return null;
  }

  if (!anchorTurnId) return null;
  const payload: PiCheckpointPayload = {
    kind: PI_CONTEXT_CHECKPOINT_KIND,
    summary,
    tokensBefore,
    ...(resume ? { resume } : {}),
  };
  return { version: 1, anchorTurnId, payload };
}

function findPreviousDurableTurn(
  historyTurns: PiHistoryTurn[],
  beforeIndex: number,
): PiHistoryTurn | undefined {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (historyTurns[index]?.turnId) return historyTurns[index];
  }
  return undefined;
}

function parseCheckpointPayload(value: unknown): PiCheckpointPayload | null {
  if (!isRecord(value)) return null;
  if (value.kind !== PI_CONTEXT_CHECKPOINT_KIND) return null;
  if (typeof value.summary !== 'string' || value.summary.length === 0) return null;
  if (
    typeof value.tokensBefore !== 'number' ||
    !Number.isFinite(value.tokensBefore) ||
    value.tokensBefore < 0
  ) {
    return null;
  }
  let resume: PiCheckpointPayload['resume'];
  if (value.resume !== undefined) {
    if (
      !isRecord(value.resume) ||
      typeof value.resume.turnId !== 'string' ||
      value.resume.turnId.length === 0 ||
      typeof value.resume.messageOffset !== 'number' ||
      !Number.isInteger(value.resume.messageOffset) ||
      value.resume.messageOffset < 0
    ) {
      return null;
    }
    resume = { turnId: value.resume.turnId, messageOffset: value.resume.messageOffset };
  }
  return {
    kind: PI_CONTEXT_CHECKPOINT_KIND,
    summary: value.summary,
    tokensBefore: value.tokensBefore,
    ...(resume ? { resume } : {}),
  };
}

/**
 * Provider usage includes the discarded prefix. Estimate the compacted content
 * until the next live response reports usage for the new context.
 */
function withoutPrefixUsage(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.map((message) =>
    message.role === 'assistant'
      ? {
          ...message,
          usage: {
            ...message.usage,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
          },
        }
      : message,
  );
}

function createCompactionSummary(summary: string, tokensBefore: number): AgentMessage {
  return { role: 'compactionSummary', summary, tokensBefore, timestamp: Date.now() };
}

/**
 * Pi's default conversion drops summary messages, so a compacted request would
 * lose all earlier context and could open with an assistant message.
 */
export function convertPiMessagesToLlm(messages: AgentMessage[]): PiLlmMessage[] {
  return messages.flatMap((message): PiLlmMessage[] => {
    switch (message.role) {
      case 'compactionSummary':
        return [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${message.summary}\n</summary>`,
              },
            ],
            timestamp: message.timestamp,
          },
        ];
      case 'user':
      case 'assistant':
      case 'toolResult':
        return [message];
      default:
        return [];
    }
  });
}

function serializeTool(tool: PiToolSchema): string {
  return `${tool.name}\n${tool.description}\n${safeJsonStringify(tool.parameters)}`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / PI_ESTIMATED_CHARACTERS_PER_TOKEN + nonAsciiTokenReserve(text));
}

function nonAsciiTokenReserve(text: string): number {
  let reserve = 0;
  for (const character of text.matchAll(/\P{ASCII}/gu)) {
    reserve += 2 - character[0].length / PI_ESTIMATED_CHARACTERS_PER_TOKEN;
  }
  return reserve;
}

function countImages(message: AgentMessage): number {
  if (message.role !== 'user' || typeof message.content === 'string') return 0;
  return message.content.filter((part) => part.type === 'image').length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
