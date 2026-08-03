import { finalizeDanglingToolApprovals } from '@cherrystudio/universal/ai/transport/toolApprovals';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
} from '@cherrystudio/universal/data/types/message';
import {
  type CherryReasoningMeta,
  readCherryMeta,
  withCherryMeta,
} from '@cherrystudio/universal/data/types/uiParts';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

const TERMINAL_TOOL_STATES: ReadonlySet<string> = new Set([
  'output-available',
  'output-error',
  'output-denied',
]);

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function hasPendingToolApproval(parts: readonly CherryMessagePart[]): boolean {
  return parts.some((part) => isToolPart(part) && part.state === 'approval-requested');
}

/**
 * A decision the resumed stream never acted on. The SDK rewrites a decided part
 * as it runs (or denies) the call, so one still sitting in `approval-responded`
 * when the stream ends cleanly means the tool never reached it — its ToolSet
 * did not contain the tool, which is what a cold tool cache after a restart
 * looks like. The call is left with no result, so the turn has to fail rather
 * than settle.
 */
export function hasUnresumedToolApproval(parts: readonly CherryMessagePart[]): boolean {
  return parts.some((part) => isToolPart(part) && part.state === 'approval-responded');
}

/**
 * Settle every unresolved approval terminally. Used when a turn is torn down
 * instead of resumed (abort, stream error): a waiting part would otherwise
 * re-summon the approval sheet, and either a waiting or an answered-but-
 * unresumed part would leave the model's tool call without a result — which
 * the provider rejects on every later request in that branch.
 */
export function finalizeTurnToolApprovals(
  parts: readonly CherryMessagePart[],
  reason: string,
): CherryMessagePart[] {
  return finalizeDanglingToolApprovals(parts, reason).parts;
}

/**
 * Bring every part to a terminal state after a turn ended early.
 *
 * Ported from desktop `streamManager/persistence/PersistenceBackend.ts`, minus
 * its `data-agent-task-event` branch (agent-only; mobile emits no such part).
 *
 * Ordering contract, do not reorder on sync: callers run
 * `finalizeTurnToolApprovals` first, so approval parts are already settled as
 * `output-denied` with `settledByApp` by the time this runs. Desktop has no
 * approval settlement step and turns those parts straight into a bare
 * `output-error`; the terminal-state check below is what keeps the richer
 * mobile outcome from being overwritten.
 */
export function finalizeInterruptedParts(
  parts: CherryMessagePart[],
  status: 'success' | 'paused' | 'error',
): CherryMessagePart[] {
  if (status === 'success') return parts;
  const interruptionReason = status === 'paused' ? 'Interrupted by user' : 'Stream errored';
  const toolError =
    status === 'paused' ? interruptionReason : `${interruptionReason} before tool completed`;

  return parts.map((part) => {
    if (part.type === 'reasoning') {
      // A reasoning part left at `streaming` renders as perpetually thinking on
      // every future load. Force it done and backfill `thinkingMs` when the
      // stream never sent a `reasoning-end` to compute it.
      if (part.state !== 'streaming') return part;

      const cherry = readCherryMeta(part);
      const startedAt = cherry?.startedAt;
      const thinkingMs = cherry?.thinkingMs;
      const patch: Partial<CherryReasoningMeta> =
        typeof startedAt === 'number' && Number.isFinite(startedAt) && !Number.isFinite(thinkingMs)
          ? { thinkingMs: Math.max(0, Date.now() - startedAt) }
          : {};

      return withCherryMeta({ ...part, state: 'done' }, patch);
    }

    if (!isToolPart(part)) return part;
    const toolPart = part as CherryMessagePart & { state?: string; errorText?: string };
    if (toolPart.state && TERMINAL_TOOL_STATES.has(toolPart.state)) return part;
    return {
      ...toolPart,
      state: 'output-error',
      errorText: toolPart.errorText ?? toolError,
    } as CherryMessagePart;
  });
}

/**
 * Drop parts that carry no renderable content — empty/whitespace-only `text`
 * and `reasoning` parts. The AI SDK accumulator can leave these behind at step
 * boundaries (e.g. a final text step that produced no output); persisting them
 * yields invisible message blocks that still inject layout spacing on render.
 *
 * Returns the original array by reference when nothing is dropped, so a clean
 * turn keeps a stable identity (matching `finalizeInterruptedParts`).
 */
export function dropEmptyContentParts(parts: CherryMessagePart[]): CherryMessagePart[] {
  const filtered = parts.filter((part) => {
    if (part.type !== 'text' && part.type !== 'reasoning') return true;
    return part.text.trim().length > 0;
  });
  return filtered.length === parts.length ? parts : filtered;
}

export function applyStreamingMessage(baseMessage: Message, uiMessage: CherryUIMessage): Message {
  return {
    ...baseMessage,
    data: {
      ...baseMessage.data,
      parts: uiMessage.parts as CherryMessagePart[],
    },
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
}
