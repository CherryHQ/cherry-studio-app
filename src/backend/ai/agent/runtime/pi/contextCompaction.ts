import type { AgentMessage, AgentTool as PiAgentTool } from '@earendil-works/pi-agent-core';
import {
  compact,
  estimateContextTokens,
  prepareCompaction,
  shouldCompact,
  type CompactionPreparation,
  type CompactionSettings,
} from '@earendil-works/pi-agent-core/compaction';
import type {
  Api as PiApi,
  Model as PiModel,
  Models,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import type { RuntimeContextCheckpoint } from '../types';
import type { PiConversation, PiHistoryTurn } from './modelMessages';

const PI_CONTEXT_CHECKPOINT_KIND = 'pi-context-compaction';
const PI_ESTIMATED_IMAGE_TOKENS = 1_200;

export const PI_ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const PI_IMAGE_CONTEXT_TOKEN_RESERVE = 4_096;
export const PI_CONTEXT_SAFETY_MARGIN_TOKENS = 1_024;
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
  return estimateContextTokens(messages).tokens;
}

/** Remaining room for model-loop messages before another provider request. */
export function estimatePiLoopContextHeadroomTokens(input: {
  contextWindow: number;
  messages: AgentMessage[];
  outputReserveTokens: number;
  systemPrompt: string;
  tools: readonly PiToolSchema[];
}): number {
  const messageTokens = estimatePiMessagesTokens(input.messages);
  const fixedCosts = estimatePiNonMessageContextCosts({
    imageMessages: input.messages,
    outputReserveTokens: input.outputReserveTokens,
    systemPrompt: input.systemPrompt,
    tools: input.tools,
  });

  return input.contextWindow - messageTokens - fixedCosts.totalTokens;
}

export function estimatePiContextFixedCosts(input: {
  conversation: PiConversation;
  outputReserveTokens: number;
  tools: readonly PiToolSchema[];
}): PiContextFixedCosts {
  const currentInputTokens = estimateContextTokens([input.conversation.prompt]).tokens;
  const fixedCosts = estimatePiNonMessageContextCosts({
    imageMessages: [...input.conversation.history, input.conversation.prompt],
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

export async function planPiContext(input: {
  checkpoint: RuntimeContextCheckpoint | null;
  conversation: PiConversation;
  model: PiModel<PiApi>;
  models: Pick<Models, 'completeSimple'>;
  options?: PiContextCompactionOptions;
  outputReserveTokens: number;
  redactSummary: (summary: string) => string;
  signal: AbortSignal;
  thinkingLevel: Parameters<typeof compact>[5];
  tools: readonly PiToolSchema[];
}): Promise<PiContextPlan> {
  const projected = projectContext(input.checkpoint, input.conversation.historyTurns);
  const settings = input.options?.settings ?? resolveCompactionSettings(input.model.contextWindow);
  const estimateHistory =
    input.options?.estimateHistoryTokens ??
    ((messages: AgentMessage[]) => estimateContextTokens(messages).tokens);
  const historyTokens = Math.max(0, estimateHistory(projected.messages));
  const fixedCosts = estimatePiContextFixedCosts({
    conversation: input.conversation,
    outputReserveTokens: input.outputReserveTokens,
    tools: input.tools,
  });
  const compactionThreshold = Math.max(0, input.model.contextWindow - settings.reserveTokens);

  if (fixedCosts.totalTokens > compactionThreshold) {
    return {
      ok: false,
      code: 'context_window_exceeded',
      message: 'The current input exceeds the model context window.',
      retryable: false,
    };
  }

  const totalTokens = historyTokens + fixedCosts.totalTokens;
  if (!shouldCompact(totalTokens, input.model.contextWindow, settings)) {
    return { ok: true, messages: projected.messages, checkpoint: null, usage: null };
  }

  const preparation = prepareCompaction(projected.entries, settings);
  if (!preparation.ok) {
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
    return totalTokens > input.model.contextWindow
      ? {
          ok: false,
          code: 'context_window_exceeded',
          message: 'The conversation exceeds the model context window.',
          retryable: false,
        }
      : { ok: true, messages: projected.messages, checkpoint: null, usage: null };
  }

  const cherryPreparation: CompactionPreparation = {
    ...preparation.value,
    fileOps: { read: new Set(), written: new Set(), edited: new Set() },
  };
  const result = await compact(
    cherryPreparation,
    input.models as Models,
    input.model,
    CHERRY_COMPACTION_INSTRUCTIONS,
    input.signal,
    input.thinkingLevel,
  );
  if (!result.ok) {
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
  const checkpoint = createCheckpoint(
    projected.checkpoint,
    input.conversation.historyTurns,
    cherryPreparation,
    projected.metadata,
    summary,
    result.value.tokensBefore,
  );
  return {
    ok: true,
    messages: [
      createCompactionSummary(summary, result.value.tokensBefore),
      ...result.value.retainedTail,
    ],
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

function createCompactionSummary(summary: string, tokensBefore: number): AgentMessage {
  return { role: 'compactionSummary', summary, tokensBefore, timestamp: Date.now() };
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
  return Math.ceil(text.length / PI_ESTIMATED_CHARACTERS_PER_TOKEN);
}

function countImages(message: AgentMessage): number {
  if (message.role !== 'user' || typeof message.content === 'string') return 0;
  return message.content.filter((part) => part.type === 'image').length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
