import * as z from 'zod';

import { UniqueModelIdSchema } from '@/shared/data/types/model';

export const MULTI_MODEL_TOOL_NAME = 'cherry_multi_model_reply';

export const AgentMultiModelIdsSchema = z
  .array(UniqueModelIdSchema)
  .min(2)
  .refine((ids) => new Set(ids).size === ids.length, 'Models must be unique.');

export const AgentMultiModelCandidateSchema = z.strictObject({
  id: z.string().min(1),
  modelId: UniqueModelIdSchema,
  name: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
  text: z.string(),
  reasoning: z.string(),
  attempt: z.number().int().positive(),
  error: z
    .strictObject({ code: z.string(), message: z.string(), retryable: z.boolean() })
    .optional(),
  usage: z
    .strictObject({
      inputTokens: z.number().nonnegative(),
      outputTokens: z.number().nonnegative(),
      totalTokens: z.number().nonnegative(),
    })
    .optional(),
});
export type AgentMultiModelCandidate = z.infer<typeof AgentMultiModelCandidateSchema>;

export const AgentMultiModelResultSchema = z.strictObject({
  kind: z.literal('multi-model-reply'),
  version: z.literal(1),
  candidates: z.array(AgentMultiModelCandidateSchema),
});
export type AgentMultiModelResult = z.infer<typeof AgentMultiModelResultSchema>;

/** One path inherits its parent's prefix, then owns its subsequent messages. */
export const AgentConversationPathSchema = z.strictObject({
  id: z.string().min(1),
  parentPathId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  sourcePathId: z.string().nullable(),
  candidateId: z.string().nullable(),
  adopted: z.record(z.string(), z.string()),
});
export type AgentConversationPath = z.infer<typeof AgentConversationPathSchema>;

export const AgentConversationStateSchema = z.strictObject({
  activePathId: z.string().min(1),
  paths: z.array(AgentConversationPathSchema).min(1),
  /** Answer identity -> the last path selected for that answer. */
  choices: z.record(z.string(), z.string()),
});
export type AgentConversationState = z.infer<typeof AgentConversationStateSchema>;

export const AgentSelectAnswerInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
  candidateId: z.string().min(1),
});
export type AgentSelectAnswerInput = z.infer<typeof AgentSelectAnswerInputSchema>;

export const AgentPrepareContinuationInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
  candidateId: z.string().min(1).optional(),
});
export type AgentPrepareContinuationInput = z.infer<typeof AgentPrepareContinuationInputSchema>;

export function readMultiModelResult(value: unknown): AgentMultiModelResult | null {
  const parsed = AgentMultiModelResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const ROOT_CONVERSATION_PATH = 'root';

export function createConversationState(): AgentConversationState {
  return {
    activePathId: ROOT_CONVERSATION_PATH,
    paths: [
      {
        id: ROOT_CONVERSATION_PATH,
        parentPathId: null,
        sourceMessageId: null,
        sourcePathId: null,
        candidateId: null,
        adopted: {},
      },
    ],
    choices: {},
  };
}

export function answerChoiceKey(messageId: string, candidateId?: string): string {
  return JSON.stringify([messageId, candidateId ?? null]);
}

export function conversationPathChain(
  state: AgentConversationState,
  pathId = state.activePathId,
): AgentConversationPath[] {
  const paths = new Map(state.paths.map((path) => [path.id, path]));
  const chain: AgentConversationPath[] = [];
  const visited = new Set<string>();
  let path = paths.get(pathId);
  while (path && !visited.has(path.id)) {
    visited.add(path.id);
    chain.unshift(path);
    path = path.parentPathId ? paths.get(path.parentPathId) : undefined;
  }
  if (!chain.length || chain[0].parentPathId !== null)
    throw new Error('The conversation path is unavailable.');
  return chain;
}

export function conversationSelections(state: AgentConversationState): Record<string, string> {
  return Object.assign({}, ...conversationPathChain(state).map((path) => path.adopted));
}

export function visibleConversationMessages<T extends { id: string; pathId?: string }>(
  messages: readonly T[],
  state: AgentConversationState,
): T[] {
  let visible: T[] = [];
  for (const path of conversationPathChain(state)) {
    if (path.sourceMessageId) {
      const boundary = visible.findIndex((message) => message.id === path.sourceMessageId);
      if (boundary < 0) throw new Error('The continuation source is unavailable.');
      visible = visible.slice(0, boundary + 1);
    }
    visible.push(
      ...messages.filter((message) => (message.pathId ?? ROOT_CONVERSATION_PATH) === path.id),
    );
  }
  return visible;
}

export const AgentRestoreConversationPathInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  pathId: z.string().min(1),
});
export type AgentRestoreConversationPathInput = z.infer<
  typeof AgentRestoreConversationPathInputSchema
>;

/** Read structured candidate output without treating arbitrary tool JSON as a reply group. */
export function multiModelResultFromParts(
  parts: readonly { type: string; output?: unknown; toolRef?: unknown }[],
): AgentMultiModelResult | null {
  for (const part of parts) {
    if (
      part.type !== 'dynamic-tool' ||
      !part.output ||
      typeof part.output !== 'object' ||
      !('value' in part.output)
    )
      continue;
    const ref = part.toolRef;
    if (
      !ref ||
      typeof ref !== 'object' ||
      !('source' in ref) ||
      ref.source !== 'builtin' ||
      !('capabilityId' in ref) ||
      ref.capabilityId !== MULTI_MODEL_TOOL_NAME
    )
      continue;
    const result = readMultiModelResult(part.output.value);
    if (result) return result;
  }
  return null;
}

export const AgentCancelCandidateInputSchema = AgentSelectAnswerInputSchema;
export type AgentCancelCandidateInput = z.infer<typeof AgentCancelCandidateInputSchema>;
