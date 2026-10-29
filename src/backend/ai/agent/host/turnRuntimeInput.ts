/**
 * Turn material assembly: the protocol transcript and the admitted input parts
 * become the normalized Runtime request. This direction is the Host's write
 * side; `runtimeProjection.ts` owns the read side that turns Runtime output
 * back into protocol views.
 */

import {
  AgentMessagePartSchema,
  AgentInputPartSchema,
  AgentToolResultSchema,
  type AgentInputPart,
  type MessageQuote,
  type AgentMessageView,
} from '@/shared/contracts/agent';
import type { PluginTextReference } from '@/shared/data/types/plugin';
import type { SelectionTextReference } from '@/shared/data/types/selectionReference';
import type { SkillTextReference } from '@/shared/data/types/skill';
import { createCodeBlockMarkdown } from '@/shared/utils/createCodeBlockMarkdown';

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
 * A terminal tool part that never received its input (the stream ended while
 * the provider was still sending arguments) has no replayable call, so the
 * pair is omitted rather than sent back as a call with `null` arguments.
 */
export function toRuntimeHistory(
  messages: AgentMessageView[],
  attachments: RuntimeAttachmentContents = new Map(),
  /** The turn's model: a context anchor measured by another model's tokenizer is not used. */
  anchorModelId?: string,
): RuntimeHistoryTurn[] {
  const history: RuntimeHistoryTurn[] = [];
  const anchor = contextAnchor(messages, anchorModelId);
  for (const message of messages) {
    const parts: RuntimeMessagePart[] = [];
    for (const part of message.parts) {
      switch (part.type) {
        case 'source-url':
          parts.push({
            type: 'text',
            text: `Source [cite:${part.sourceId}]: ${JSON.stringify({ title: part.title, url: part.url })}`,
          });
          break;
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
        case 'dynamic-tool': {
          const validPart = AgentMessagePartSchema.safeParse(part);
          const output = AgentToolResultSchema.safeParse(part.output);
          if (
            validPart.success &&
            (part.state === 'output-available' ||
              part.state === 'denied' ||
              part.state === 'error' ||
              part.state === 'interrupted') &&
            part.input !== undefined &&
            output.success
          ) {
            parts.push({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolRef: part.toolRef,
              providerName: part.toolName,
              input: part.input,
            });
            parts.push({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              output: {
                ...output.data,
                ...(output.data.modelContent?.some((block) => block.type === 'image')
                  ? {
                      modelImages: output.data.modelContent.flatMap((block) => {
                        if (block.type !== 'image') return [];
                        const image = attachments.get(block.fileEntryId);
                        const prefix = `data:${block.mimeType};base64,`;
                        return image?.type === 'file' && image.uri.startsWith(prefix)
                          ? [
                              {
                                fileEntryId: block.fileEntryId,
                                data: image.uri.slice(prefix.length),
                                mediaType: block.mimeType,
                              },
                            ]
                          : [];
                      }),
                    }
                  : {}),
              },
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
    const runtimeTurn: RuntimeHistoryTurn =
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
        ...(message === anchor.message ? { contextTokens: anchor.contextTokens } : {}),
      };
      runtimeTurn.messages.push(runtimeMessage);
    }
  }
  return history;
}

/**
 * Only the newest assistant message may anchor the estimate: it follows any
 * context checkpoint, and its measurement already covers everything before it.
 * A failed, cancelled, or retried answer carries no measurement, so the next
 * turn falls back to estimating by content.
 */
function contextAnchor(
  messages: readonly AgentMessageView[],
  modelId: string | undefined,
): { message?: AgentMessageView; contextTokens?: number } {
  const newest = messages.findLast((message) => message.role === 'assistant');
  const contextTokens = newest?.stats?.contextTokens;
  if (!newest || modelId === undefined || newest.modelId !== modelId) return {};
  if (typeof contextTokens !== 'number' || !Number.isFinite(contextTokens) || contextTokens <= 0) {
    return {};
  }
  return { message: newest, contextTokens };
}

/** Preserve message-scoped composer intent as user content, without changing the stored text. */
export function runtimeUserText(part: {
  text: string;
  quotes?: [MessageQuote];
  pluginReferences?: PluginTextReference[];
  selectionReferences?: SelectionTextReference[];
  skillReferences?: SkillTextReference[];
}): string {
  AgentInputPartSchema.parse({
    type: 'text',
    text: part.text,
    ...(part.pluginReferences ? { pluginReferences: part.pluginReferences } : {}),
    ...(part.skillReferences ? { skillReferences: part.skillReferences } : {}),
    ...(part.selectionReferences ? { selectionReferences: part.selectionReferences } : {}),
  });
  let text = part.text;
  // A selection chip reaches the model as the fenced block desktop sends, right after its label.
  for (const reference of [...(part.selectionReferences ?? [])].sort(
    (left, right) => right.offset - left.offset,
  )) {
    const end = reference.offset + reference.label.length;
    const block = createCodeBlockMarkdown(JSON.stringify(reference.selection), 'selection-ref');
    text = `${text.slice(0, end)}\n${block}\n${text.slice(end)}`;
  }
  if (part.pluginReferences?.length) {
    const pluginIds = [...new Set(part.pluginReferences.map((reference) => reference.pluginId))];
    text = `${text}\n\nFor this message, use the plugins explicitly selected in the composer: ${JSON.stringify(pluginIds)}. Other connected plugins remain available if needed.`;
  }
  return formatMessageQuote(text, part.quotes);
}

export function formatMessageQuote(
  expandedRequest: string,
  quotes?: readonly [MessageQuote],
): string {
  if (!quotes) return expandedRequest;
  // The quoted passage leads as a Markdown blockquote, the way chat apps send a selection.
  const quoted = quotes[0].text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
  return `${quoted}\n\n${expandedRequest}`;
}
