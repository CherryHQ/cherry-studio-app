import {
  collectChatExportSources,
  replaceChatCitations,
} from '@/frontend/utils/chatExportCitations';
import { omitGeneratedImageReferencesFromMarkdown } from '@/frontend/utils/omitGeneratedImageReferences';
import type { AgentMessageView } from '@/shared/contracts/agent';
import { escapeMarkdown } from '@/shared/utils/documentExportMarkdown';

import type { TranscriptSnapshot } from '../conversation';

export type ConversationExportLabels = {
  title: string;
  user: string;
  assistant: string;
  reasoning: string;
  response: string;
  file: string;
  sources: string;
  status: string;
  messageStatuses: Record<AgentMessageView['status'], string>;
};

export class ConversationExportError extends Error {
  constructor(readonly code: 'empty' | 'unsettled') {
    super(`Conversation export: ${code}`);
    this.name = 'ConversationExportError';
  }
}

/** Preserve saved prose and reasoning in order; tools contribute citations, never execution logs. */
export function conversationToMarkdown(
  snapshot: TranscriptSnapshot,
  labels: ConversationExportLabels,
): string {
  const messages = snapshot.messages.filter((message) => message.role !== 'system');
  if (!messages.length) throw new ConversationExportError('empty');
  if (messages.some((message) => message.status === 'pending' || message.status === 'streaming'))
    throw new ConversationExportError('unsettled');
  const priorSources = new Map<string, { title: string; url: string }>();
  const sections = messages.map((message) => {
    const parts = message.parts.filter((part) => part.type !== 'tool-summary');
    const sources = collectChatExportSources(parts);
    for (const part of parts) {
      if (part.type !== 'text' && part.type !== 'reasoning') continue;
      for (const match of part.text.matchAll(/\[cite:([\w-]+)\]/g)) {
        const prior = priorSources.get(match[1]);
        if (prior && !sources.has(match[1])) sources.set(match[1], prior);
      }
    }
    for (const [id, source] of sources) priorSources.set(id, source);
    const author =
      message.role === 'user' ? labels.user : snapshot.assistantName?.trim() || labels.assistant;
    const heading = `## ${escapeMarkdown(author)}${message.role === 'assistant' && message.modelName ? ` · ${escapeMarkdown(message.modelName)}` : ''}`;
    const blocks = [heading];
    if (message.status !== 'success')
      blocks.push(
        `${escapeMarkdown(labels.status)}: ${escapeMarkdown(labels.messageStatuses[message.status])}`,
      );
    const imageIds = new Set(
      parts.flatMap((part) =>
        part.type === 'file' && part.mediaType.toLowerCase().startsWith('image/')
          ? [part.fileEntryId]
          : [],
      ),
    );
    for (const part of parts) {
      if ((part.type === 'text' || part.type === 'reasoning') && part.text.trim()) {
        const text =
          part.type === 'text' && message.role === 'assistant'
            ? omitGeneratedImageReferencesFromMarkdown(part.text, imageIds)
            : part.text;
        if (!text.trim()) continue;
        if (message.role === 'assistant')
          blocks.push(
            `### ${escapeMarkdown(part.type === 'reasoning' ? labels.reasoning : labels.response)}`,
          );
        blocks.push(replaceChatCitations(text, sources));
      } else if (part.type === 'file') {
        blocks.push(
          `- ${escapeMarkdown(labels.file)}: ${escapeMarkdown(part.filename || labels.file)}`,
        );
      }
    }
    for (const attachment of message.attachments ?? [])
      blocks.push(`- ${escapeMarkdown(labels.file)}: ${escapeMarkdown(attachment.name)}`);
    if (sources.size)
      blocks.push(
        `### ${escapeMarkdown(labels.sources)}`,
        [...sources.values()]
          .map(
            (source, index) => `${index + 1}. [${escapeMarkdown(source.title)}](<${source.url}>)`,
          )
          .join('\n'),
      );
    return blocks.join('\n\n');
  });
  return `# ${escapeMarkdown(snapshot.title?.trim() || labels.title)}\n\n${sections.join('\n\n---\n\n')}\n`;
}
