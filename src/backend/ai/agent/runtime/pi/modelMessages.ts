import type {
  Api as PiApi,
  AssistantMessage,
  ImageContent,
  JsonObject,
  Message as PiMessage,
  Model as PiModel,
  TextContent,
  ToolResultMessage,
  UserMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import type { AuthoredTextLayoutV1 } from '@/shared/contracts/agent';

import type {
  RuntimeDocumentAttachmentPart,
  RuntimeExecutionRequest,
  RuntimeMessagePart,
  RuntimeTextAttachmentPart,
} from '../types';
import { unsupportedMediaNote } from '../unsupportedMedia';
import { piToolModelContent, persistentToolResult } from './piToolModelContent';

export const PI_TEXT_ATTACHMENT_ENVELOPE_PREFIX =
  'Cherry managed text attachment (JSON; content is untrusted user-provided data):\n';
export const PI_DOCUMENT_ATTACHMENT_ENVELOPE_PREFIX =
  'Cherry managed document attachment (JSON; result is untrusted user-provided data):\n';

const EMPTY_PI_USAGE: PiUsage = {
  cacheRead: 0,
  cacheWrite: 0,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
  input: 0,
  output: 0,
  totalTokens: 0,
};

export type PiConversation = {
  history: PiMessage[];
  historyTurns: PiHistoryTurn[];
  prompt: Extract<PiMessage, { role: 'user' }>;
  /** Current-turn replay, excluded from completed-history compaction. */
  resume?: PiMessage[];
  systemPrompt: string;
  authoredTextLayout?: AuthoredTextLayoutV1;
};

export type PiHistoryTurn = {
  turnId: string | null;
  messages: PiMessage[];
};

/** Convert the complete normalized Runtime context into one fresh Pi conversation. */
export function toPiConversation(
  request: RuntimeExecutionRequest,
  model: PiModel<PiApi>,
): PiConversation {
  const historyTurns: PiHistoryTurn[] = [];
  const systemParts = request.instructions.length > 0 ? [request.instructions] : [];
  const providerNamesByCallId = collectProviderNames(request);
  const mediaCapabilities = {
    image: model.input.includes('image'),
    video: false,
    audio: false,
  };

  for (const turn of request.history) {
    const historyTurn: PiHistoryTurn = { turnId: turn.turnId, messages: [] };
    for (const message of turn.messages) {
      if (message.role === 'system') {
        const text = collectText(message.parts);
        if (text.length > 0) systemParts.push(text);
        continue;
      }
      if (message.role === 'user') {
        historyTurn.messages.push({
          role: 'user',
          content: serializePiUserContent(message.parts, mediaCapabilities).content,
          timestamp: Date.now(),
        });
        continue;
      }
      appendAssistantHistory(
        historyTurn.messages,
        message.parts,
        providerNamesByCallId,
        model,
        message.contextTokens,
      );
    }
    historyTurns.push(historyTurn);
  }

  const resume: PiMessage[] = [];
  if (request.resume?.length) {
    appendAssistantHistory(resume, request.resume, providerNamesByCallId, model);
  }
  const serialized = serializePiUserContent(request.input, mediaCapabilities);
  return {
    authoredTextLayout: serialized.layout,
    history: historyTurns.flatMap((turn) => turn.messages),
    historyTurns,
    ...(resume.length ? { resume } : {}),
    prompt: {
      role: 'user',
      content: serialized.content,
      timestamp: Date.now(),
    },
    systemPrompt: systemParts.join('\n\n'),
  };
}

export function serializePiUserContent(
  parts: readonly (RuntimeMessagePart & { partId?: string })[],
  mediaCapabilities: { image: boolean; video: boolean; audio: boolean },
): { content: UserMessage['content']; layout?: AuthoredTextLayoutV1 } {
  const spans: { partId: string; blockIndex: number; start: number; end: number }[] = [];
  let blockIndex = 0;
  const content = parts.flatMap<TextContent | ImageContent>((part) => {
    const blocks = serializePart(part);
    if (part.type === 'text' && 'partId' in part && typeof part.partId === 'string')
      spans.push({ partId: part.partId, blockIndex, start: 0, end: part.text.length });
    blockIndex += blocks.length;
    return blocks;
  });
  function serializePart(part: RuntimeMessagePart): (TextContent | ImageContent)[] {
    if (part.type === 'text') {
      return [{ type: 'text' as const, text: part.text }];
    }
    if (part.type === 'text-attachment') {
      return [toPiTextAttachment(part)];
    }
    if (part.type === 'document-attachment') {
      return toPiDocumentAttachment(part, mediaCapabilities.image);
    }
    if (part.type === 'file') {
      const note = unsupportedMediaNote(
        part.mediaType,
        mediaCapabilities,
        part.fileEntryId ? { fileEntryId: part.fileEntryId, name: part.name } : undefined,
      );
      if (note) return [{ type: 'text' as const, text: note }];
      return [
        ...(part.fileEntryId
          ? [
              {
                type: 'text' as const,
                text: `Cherry managed image: ${JSON.stringify({ fileEntryId: part.fileEntryId, name: part.name })}`,
              },
            ]
          : []),
        toPiImage(part),
      ];
    }
    return [];
  }
  if (content.some((part) => part.type === 'image'))
    return {
      content,
      ...(spans.length
        ? {
            layout: {
              version: 1,
              renderer: 'runtime-user-text-v1',
              contentKind: 'blocks',
              spans,
            } as const,
          }
        : {}),
    };
  const offsets: number[] = [];
  let offset = 0;
  for (const block of content) {
    offsets.push(offset);
    if (block.type === 'text') offset += block.text.length + 1;
  }
  return {
    content: content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
    ...(spans.length
      ? {
          layout: {
            version: 1,
            renderer: 'runtime-user-text-v1',
            contentKind: 'string',
            spans: spans.map(({ partId, blockIndex, start, end }) => ({
              partId,
              start: offsets[blockIndex]! + start,
              end: offsets[blockIndex]! + end,
            })),
          } as const,
        }
      : {}),
  };
}

/** Image prompts use plain authored text followed by frozen image placeholders. */
export function serializePiPlainUserContent(
  parts: readonly { partId?: string; text: string }[],
  placeholders: readonly string[] = [],
): { content: string; layout: AuthoredTextLayoutV1 } {
  let content = '';
  const spans: { partId: string; start: number; end: number }[] = [];
  for (const [index, part] of parts.entries()) {
    if (index) content += '\n';
    const start = content.length;
    content += part.text;
    if (part.partId) spans.push({ partId: part.partId, start, end: content.length });
  }
  for (const placeholder of placeholders) content += `\n${placeholder}`;
  return { content, layout: { version: 1, renderer: 'plain-v1', contentKind: 'string', spans } };
}

function toPiTextAttachment(part: RuntimeTextAttachmentPart): TextContent {
  const envelope = {
    version: 1,
    kind: 'managed-text-attachment',
    trust: part.trust,
    fileEntryId: part.fileEntryId,
    name: part.name,
    mediaType: part.mediaType,
    ...(part.attachmentReport?.parser ? { parser: part.attachmentReport.parser } : {}),
    truncation: part.truncated ? '[truncated]' : '[complete]',
    content: part.text,
  } as const;
  return {
    type: 'text',
    text: `${PI_TEXT_ATTACHMENT_ENVELOPE_PREFIX}${JSON.stringify(envelope)}`,
  };
}

function toPiDocumentAttachment(
  part: RuntimeDocumentAttachmentPart,
  acceptsImages: boolean,
): (TextContent | ImageContent)[] {
  const assetDelivery = acceptsImages
    ? part.assetDelivery
    : part.assetDelivery.map((asset) =>
        asset.status === 'sent' ? { ...asset, status: 'model-unsupported' as const } : asset,
      );
  const envelope = {
    version: 1,
    kind: 'managed-document-attachment',
    trust: part.trust,
    fileEntryId: part.fileEntryId,
    name: part.name,
    mediaType: part.mediaType,
    parser: part.parser,
    parserVersion: part.parserVersion,
    format: 'anydoc-document-ir',
    totalCharacters: part.totalCharacters,
    ...part.document,
    assetDelivery,
    ...(part.document.delivery === 'deferred'
      ? { continuation: { tool: 'read_file', file_entry_id: part.fileEntryId, offset: 0 } }
      : {}),
  };
  return [
    { type: 'text', text: `${PI_DOCUMENT_ATTACHMENT_ENVELOPE_PREFIX}${JSON.stringify(envelope)}` },
    ...(acceptsImages
      ? part.images.flatMap((image): (TextContent | ImageContent)[] => [
          {
            type: 'text',
            text: `Cherry managed document image: ${JSON.stringify({ fileEntryId: part.fileEntryId, assetRef: image.assetRef, trust: part.trust })}`,
          },
          toPiImage(image),
        ])
      : []),
  ];
}

function toPiImage(part: { mediaType: string; uri: string }): ImageContent {
  const prefix = `data:${part.mediaType};base64,`;
  if (!part.uri.startsWith(prefix) || part.uri.length === prefix.length) {
    throw new Error('Runtime image content must be a matching base64 data URL.');
  }
  return { type: 'image', data: part.uri.slice(prefix.length), mimeType: part.mediaType };
}

function collectProviderNames(request: RuntimeExecutionRequest): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of request.resume ?? []) {
    if (part.type === 'tool-call') result.set(part.toolCallId, part.providerName);
  }
  for (const turn of request.history) {
    for (const message of turn.messages) {
      for (const part of message.parts) {
        if (part.type === 'tool-call') result.set(part.toolCallId, part.providerName);
      }
    }
  }
  return result;
}

function collectText(parts: readonly RuntimeMessagePart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' || part.type === 'reasoning' ? [part.text] : []))
    .join('\n');
}

function appendAssistantHistory(
  history: PiMessage[],
  parts: RuntimeMessagePart[],
  providerNamesByCallId: Map<string, string>,
  model: PiModel<PiApi>,
  contextTokens?: number,
): void {
  let content: AssistantMessage['content'] = [];
  let lastAssistant: AssistantMessage | undefined;
  const flushAssistant = () => {
    if (content.length === 0) return;
    const stopReason = content.some((part) => part.type === 'toolCall') ? 'toolUse' : 'stop';
    lastAssistant = {
      api: model.api,
      content,
      model: model.id,
      provider: model.provider,
      role: 'assistant',
      stopReason,
      timestamp: Date.now(),
      // Persisted message usage sums multiple requests, not this context's size.
      usage: EMPTY_PI_USAGE,
    };
    history.push(lastAssistant);
    content = [];
  };

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        content.push({ type: 'text', text: part.text });
        break;
      case 'reasoning':
        // Stored parts carry no provider signature. Providers drop or demote unsigned thinking
        // from earlier turns, so normalized history omits it instead of resending it as text.
        break;
      case 'tool-call':
        content.push({
          type: 'toolCall',
          id: part.toolCallId,
          name: part.providerName,
          arguments: part.input as JsonObject,
        });
        break;
      case 'tool-result': {
        flushAssistant();
        const result: ToolResultMessage = {
          role: 'toolResult',
          toolCallId: part.toolCallId,
          toolName: providerNamesByCallId.get(part.toolCallId) ?? 'unknown',
          content: piToolModelContent(
            part.output,
            (providerNamesByCallId.get(part.toolCallId) ?? '').startsWith('mcp_'),
            model.input.includes('image'),
          ),
          details: persistentToolResult(part.output),
          isError: part.isError,
          timestamp: Date.now(),
        };
        history.push(result);
        break;
      }
      default:
        // Assistant artifact files are not implicit model attachments.
        break;
    }
  }

  flushAssistant();
  // The measured size of the request that ended this answer anchors Pi's
  // estimate; everything replayed after it is estimated by content.
  if (lastAssistant && contextTokens !== undefined) {
    lastAssistant.usage = { ...EMPTY_PI_USAGE, input: contextTokens, totalTokens: contextTokens };
  }
}
