import dayjs from 'dayjs';

import type { TranscriptMessage } from '@/frontend/appShell/conversation';
import { replaceCitationMarkers, resolveMessageCitations } from '@/frontend/utils/messageCitations';
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
import type { CherryMessagePart } from '@/shared/data/types/message';
import type { AppLanguage } from '@/shared/utils/languages';
import { messageTranslationText } from '@/shared/utils/messageTranslation';
import { sha256HexOfText } from '@/shared/utils/sha256';

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

export type ChatExportMessage = TranscriptMessage & {
  truncated?: boolean;
};

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
  const sections = messages.map((message) => {
    // Persisted tool states differ from UI states; the shared parser reads only completed
    // outputs and already supports persisted builtin toolRef identities.
    const resolved = resolveMessageCitations(
      message.parts as unknown as readonly CherryMessagePart[],
      message.citationSources,
    );
    const sources = resolved.sources;
    const citationOptions = {
      format: 'export' as const,
      numbers: resolved.sourceNumberById,
      sources: resolved.sourceById,
    };
    const blocks: ExportBlock[] = [];
    const attachments: ExportBlock[] = [];
    const imageIds = new Set(
      message.parts.flatMap((part) =>
        part.type === 'file' && part.mediaType.toLowerCase().startsWith('image/')
          ? [part.fileEntryId]
          : [],
      ),
    );
    const parts = message.parts.map((part) => {
      if (message.role === 'user' || part.type !== 'text') return part;
      const text = omitGeneratedImageReferencesFromMarkdown(part.text, imageIds);
      return text === part.text ? part : { ...part, text };
    });
    const resultIndex = finalTextIndex(parts);
    parts.forEach((part, index) => {
      if (part.type === 'file') {
        const name = part.filename || options.labels.file;
        if (part.mediaType.toLowerCase().startsWith('image/')) {
          const assetId = `${message.id}:${part.id}`;
          assets[assetId] = {
            kind: 'managed-file',
            fileEntryId: FileEntryIdSchema.parse(part.fileEntryId),
          };
          // Generated pictures belong beside the answer in transcript order.
          blocks.push({ kind: 'image', assetId, alt: name });
        } else attachments.push({ kind: 'attachment', name, mediaType: part.mediaType });
      } else if (part.type === 'text' && part.text.trim()) {
        const block: ExportBlock =
          message.role === 'user'
            ? { kind: 'text', text: part.text }
            : {
                kind: 'markdown',
                source: replaceCitationMarkers(part.text, citationOptions),
              };
        if (message.role === 'user' || index === resultIndex) blocks.push(block);
      }
    });
    blocks.push(...attachments);
    const linkedSources = sources.filter((source) => source.url);
    if (linkedSources.length)
      blocks.push({
        kind: 'links',
        summary: options.labels.sources(linkedSources.length),
        items: linkedSources.map((source) => ({
          label: source.number === undefined ? source.title : `${source.number}. ${source.title}`,
          url: source.url!,
        })),
      });
    for (const source of sources) {
      if (!source.url)
        blocks.push({
          kind: 'text',
          text: [
            source.number === undefined ? source.title : `${source.number}. ${source.title}`,
            source.content,
          ]
            .filter(Boolean)
            .join('\n'),
        });
    }
    for (const attachment of message.attachments ?? [])
      blocks.push({ kind: 'attachment', ...attachment });
    const translation = options.translations?.[message.id];
    const source =
      translation &&
      message.role === 'assistant' &&
      message.status === 'success' &&
      messageTranslationText(message.parts.filter((part) => part.type !== 'tool-summary'));
    if (translation && source && sha256HexOfText(source) === translation.sourceHash)
      blocks.push({
        kind: 'markdown',
        source: `---\n\n### ${options.labels.translation(translation.language)}\n\n${replaceCitationMarkers(translation.content, citationOptions)}`,
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
