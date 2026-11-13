import dayjs from 'dayjs';

import type { TranscriptMessage } from '@/frontend/appShell/conversation';
import {
  collectCitationSources,
  conversationCitationSources,
  resolveMessageCitations,
} from '@/frontend/utils/messageCitations';
import { omitGeneratedImageReferencesFromMarkdown } from '@/frontend/utils/omitGeneratedImageReferences';
import type { AgentMessageView } from '@/shared/contracts/agent';
import {
  DOCUMENT_EXPORT_MAX_SECTIONS,
  DocumentExportError,
  type ExportBlock,
  type ExportDocument,
} from '@/shared/contracts/documentExport';
import { CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import type { AppLanguage } from '@/shared/utils/languages';
import { messageTranslationText } from '@/shared/utils/messageTranslation';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { toAgentMessageDisplayParts } from '../runtime/agentMessageProjection';
import type { ChatShareTranslations } from './chatShareTarget';

export type ChatExportOptions = {
  title: string;
  translations?: ChatShareTranslations;
  labels: {
    user: string;
    assistant: string;
    sources(count: number): string;
    file: string;
    status: string;
    translation(language: AppLanguage): string;
    messageStatuses: Record<AgentMessageView['status'], string>;
  };
};

export type ChatExportMessage = TranscriptMessage & { truncated?: boolean };

export function isChatMessageExportable(message: ChatExportMessage) {
  return (
    !message.truncated &&
    message.role !== 'system' &&
    message.status !== 'pending' &&
    message.status !== 'streaming'
  );
}

export function toChatExportDocument(
  messages: readonly ChatExportMessage[],
  options: ChatExportOptions,
): ExportDocument {
  if (messages.length > DOCUMENT_EXPORT_MAX_SECTIONS) throw new DocumentExportError('size-limit');
  if (!messages.length || messages.some((message) => !isChatMessageExportable(message)))
    throw new Error('Invalid export selection');
  const assets: Record<string, NonNullable<ExportDocument['assets']>[string]> = {};
  const messageParts = messages.map((message) => {
    const imageIds = new Set(
      message.parts.flatMap((part) =>
        part.type === 'file' && part.mediaType.toLowerCase().startsWith('image/')
          ? [part.fileEntryId]
          : [],
      ),
    );
    return message.parts.map((part) => {
      if (message.role === 'user' || part.type !== 'text') return part;
      const text = omitGeneratedImageReferencesFromMarkdown(part.text, imageIds);
      return text === part.text ? part : { ...part, text };
    });
  });
  const presentations = messageParts.map((parts) =>
    toAgentMessageDisplayParts(
      parts.filter((part) => part.type !== 'tool-summary' && part.type !== 'prepared-file'),
    ),
  );
  const registry = conversationCitationSources(
    messages.map((message, index) => ({
      id: message.id,
      parts: presentations[index].parts ?? [],
      sources: message.citationSources ?? [],
    })),
  );
  const sections = messages.map((message, messageIndex) => {
    const presentation = presentations[messageIndex];
    const citations = resolveMessageCitations(
      presentation.parts ?? [],
      registry.get(message.id),
      'export',
    );
    const sources = new Map(
      [...collectCitationSources(presentation.parts ?? [], registry.get(message.id))].filter(
        (entry): entry is [string, { id: string; title: string; url: string }] =>
          Boolean(entry[1].url),
      ),
    );
    const orderedSources = [...sources].sort(
      ([left], [right]) =>
        (citations.sourceNumberById.get(left) ?? Infinity) -
        (citations.sourceNumberById.get(right) ?? Infinity),
    );
    const blocks: ExportBlock[] = [];
    const attachments: ExportBlock[] = [];
    const parts = messageParts[messageIndex];
    const resultIndex = finalTextIndex(parts);
    parts.forEach((part, index) => {
      if (part.type === 'file' || part.type === 'prepared-file') {
        const name = part.filename || options.labels.file;
        if (part.mediaType.toLowerCase().startsWith('image/')) {
          const assetId = `${message.id}:${part.id}`;
          if (part.type === 'file')
            assets[assetId] = {
              kind: 'managed-file',
              fileEntryId: FileEntryIdSchema.parse(part.fileEntryId),
            };
          else if (part.base64 !== undefined)
            assets[assetId] = { kind: 'prepared-image', base64: part.base64 };
          // Generated pictures belong beside the answer in transcript order.
          blocks.push({ kind: 'image', assetId, alt: name });
        } else attachments.push({ kind: 'attachment', name, mediaType: part.mediaType });
      } else if (part.type === 'text' && part.text.trim()) {
        const block: ExportBlock =
          message.role === 'user'
            ? { kind: 'text', text: part.text }
            : {
                kind: 'markdown',
                source:
                  citations.textByPartIndex.get(presentation.partKeys?.indexOf(part.id) ?? -1)
                    ?.markdown ?? part.text,
              };
        if (message.role === 'user' || index === resultIndex) blocks.push(block);
      }
    });
    blocks.push(...attachments);
    const seenUrls = new Set<string>();
    let nextSourceNumber = Math.max(0, ...citations.sourceNumberById.values()) + 1;
    const links = orderedSources.flatMap(([id, source]) => {
      if (seenUrls.has(source.url)) return [];
      seenUrls.add(source.url);
      return [
        {
          label: `${citations.sourceNumberById.get(id) ?? nextSourceNumber++}. ${source.title}`,
          url: source.url,
        },
      ];
    });
    if (links.length)
      blocks.push({
        kind: 'links',
        summary: options.labels.sources(links.length),
        items: links,
      });
    for (const attachment of message.attachments ?? [])
      blocks.push({ kind: 'attachment', ...attachment });
    const translation = options.translations?.[message.id];
    const source =
      translation &&
      message.role === 'assistant' &&
      message.status === 'success' &&
      messageTranslationText(
        message.parts.filter(
          (part) => part.type !== 'tool-summary' && part.type !== 'prepared-file',
        ),
      );
    if (translation && source && sha256HexOfText(source) === translation.sourceHash)
      blocks.push({
        kind: 'markdown',
        source: `---\n\n### ${options.labels.translation(translation.language)}\n\n${replaceChatCitations(translation.content, sources)}`,
      });
    const metadata: { label: string; value: string }[] = [];
    if (message.status !== 'success')
      metadata.push({
        label: options.labels.status,
        value: options.labels.messageStatuses[message.status],
      });
    return {
      id: message.id,
      heading: message.role === 'user' ? options.labels.user : options.labels.assistant,
      presentation: message.role === 'user' ? ('bubble' as const) : ('message' as const),
      ...(message.role === 'assistant' && {
        avatar: CHERRY_AGENT_AVATAR,
        ...(message.modelName && { model: message.modelName }),
      }),
      metadata,
      blocks,
    };
  });
  const createdAt = messages.find((message) => message.createdAt)?.createdAt;
  return {
    title: options.title,
    header: {
      title: options.labels.assistant,
      avatar: CHERRY_AGENT_AVATAR,
      ...(createdAt && dayjs(createdAt).isValid()
        ? { date: dayjs(createdAt).format('YYYY/MM/DD') }
        : {}),
    },
    sections,
    assets,
  };
}

/** Match the article's final-answer boundary using persisted Agent parts, without UI projections. */
function finalTextIndex(parts: Readonly<TranscriptMessage['parts']>): number | undefined {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (
      part.type === 'file' ||
      part.type === 'prepared-file' ||
      part.type === 'data-error' ||
      part.type === 'source-url' ||
      part.type === 'data-search-suggestions' ||
      part.type === 'data-compaction-anchor' ||
      ((part.type === 'text' || part.type === 'reasoning') && !part.text.trim())
    )
      continue;
    return part.type === 'text' ? index : undefined;
  }
  return undefined;
}

/** Portable links use the same source validation, numbering and code exclusion as the message. */
export function replaceChatCitations(
  source: string,
  sources: ReadonlyMap<string, { title: string; url: string }>,
): string {
  return (
    resolveMessageCitations(
      [{ type: 'text', text: source }],
      [...sources].map(([id, item]) => ({ ...item, id })),
      'export',
    ).textByPartIndex.get(0)?.markdown ?? source
  );
}
