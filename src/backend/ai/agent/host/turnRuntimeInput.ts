/**
 * Turn material assembly: the protocol transcript and the admitted input parts
 * become the normalized Runtime request. This direction is the Host's write
 * side; `runtimeProjection.ts` owns the read side that turns Runtime output
 * back into protocol views.
 */

import {
  AgentMessagePartSchema,
  AgentToolResultSchema,
  type AgentInputPart,
  type AgentMessageView,
} from '@/shared/contracts/agent';
import type { PluginTextReference } from '@/shared/data/types/plugin';

import type { TurnResourceLedger } from '../resources/managedFileResolver';
import type {
  RuntimeHistoryTurn,
  RuntimeInputPart,
  RuntimeMessage,
  RuntimeMessagePart,
} from '../runtime';

export type RuntimeAttachmentContents = ReadonlyMap<string, RuntimeInputPart>;

export function toRuntimeInputParts(
  parts: AgentInputPart[],
  resources?: Pick<TurnResourceLedger, 'fileEntryIds'>,
  attachments?: RuntimeAttachmentContents,
): RuntimeInputPart[] {
  return parts.flatMap((part): RuntimeInputPart[] => {
    if (part.type === 'file') {
      if (!resources?.fileEntryIds.has(part.fileEntryId)) {
        throw new Error('Managed file input is outside the turn resource ledger.');
      }
      const attachment = attachments?.get(part.fileEntryId);
      if (!attachment) {
        throw new Error('Managed file input has no resolved Runtime content.');
      }
      return [attachment];
    }
    return [{ type: 'text', text: runtimeUserText(part) }];
  });
}

/**
 * Persisted protocol transcript to normalized runtime history. Tool parts
 * expand into `tool-call` + `tool-result` pairs; protocol `error` parts stay
 * behind the boundary (they describe the turn, not model-visible content).
 */
export function toRuntimeHistory(
  messages: AgentMessageView[],
  attachments: RuntimeAttachmentContents = new Map(),
): RuntimeHistoryTurn[] {
  const history: RuntimeHistoryTurn[] = [];
  for (const message of messages) {
    const parts: RuntimeMessagePart[] = [];
    for (const part of message.parts) {
      switch (part.type) {
        case 'text':
          parts.push({
            type: 'text',
            text: message.role === 'user' ? runtimeUserText(part) : part.text,
          });
          break;
        case 'reasoning':
          parts.push({ type: part.type, text: part.text });
          break;
        case 'file':
          if (message.role === 'user' && part.purpose === 'input-attachment') {
            const attachment = attachments.get(part.fileEntryId);
            if (attachment) {
              parts.push(attachment);
            }
          }
          // Missing historical input content is omitted. Assistant artifacts
          // never become implicit model attachments.
          break;
        case 'tool': {
          const validPart = AgentMessagePartSchema.safeParse(part);
          const output = AgentToolResultSchema.safeParse(part.output);
          if (
            validPart.success &&
            (part.state === 'output-available' ||
              part.state === 'denied' ||
              part.state === 'error' ||
              part.state === 'interrupted') &&
            output.success
          ) {
            parts.push({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolRef: part.toolRef,
              providerName: part.providerName,
              input: part.input ?? null,
            });
            parts.push({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              output: output.data,
              isError: part.state === 'error' || part.state === 'interrupted',
            });
          }
          break;
        }
        default:
          break;
      }
    }
    const currentTurn = history.at(-1);
    const runtimeTurn =
      message.turnId !== null && currentTurn?.turnId === message.turnId
        ? currentTurn
        : { turnId: message.turnId, messages: [] };
    if (runtimeTurn !== currentTurn) {
      history.push(runtimeTurn);
    }
    if (parts.length > 0) {
      const runtimeMessage: RuntimeMessage = {
        role: message.role,
        parts,
        ...(message.role === 'assistant' && message.usage ? { usage: message.usage } : {}),
      };
      runtimeTurn.messages.push(runtimeMessage);
    }
  }
  return history;
}

/** Preserve message-scoped plugin intent as user content, without changing the stored text. */
function runtimeUserText(part: { text: string; pluginReferences?: PluginTextReference[] }): string {
  if (!part.pluginReferences?.length) return part.text;
  const pluginIds = [...new Set(part.pluginReferences.map((reference) => reference.pluginId))];
  return `${part.text}\n\nFor this message, use the plugins explicitly selected in the composer: ${JSON.stringify(pluginIds)}. Other connected plugins remain available if needed.`;
}
