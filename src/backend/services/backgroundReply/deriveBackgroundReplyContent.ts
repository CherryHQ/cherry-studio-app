import type {
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivity/chatReply';
import type { AgentMessagePart } from '@/shared/contracts/agent';

import type { BackgroundReplyMessage, BackgroundReplyOutcome } from './backgroundReplyTypes';

const PREVIEW_CHARACTER_LIMIT = 160;
const PREVIEW_MIN_COMPLETE_SUFFIX_LENGTH = 24;
const SENTENCE_ENDINGS = new Set(['!', '.', '?', '。', '！', '？']);
const WEB_SEARCH_TOOL_NAMES = new Set([
  'builtin_web_search',
  'builtin_web_search_preview',
  'provider_web_search',
  'web_search',
]);
const BUILT_IN_TOOL_TITLE_KEYS: Record<string, string> = {
  calendar_create_event: 'chat.builtinTool.calendar.createEvent',
  calendar_delete_event: 'chat.builtinTool.calendar.deleteEvent',
  calendar_list_collections: 'chat.builtinTool.calendar.listCalendars',
  calendar_list_events: 'chat.builtinTool.calendar.listEvents',
  calendar_update_event: 'chat.builtinTool.calendar.updateEvent',
  health_get_summary: 'chat.builtinTool.health.summary',
  health_list_workouts: 'chat.builtinTool.health.listWorkouts',
  location_get_current: 'chat.builtinTool.location.current',
  reminder_create_item: 'chat.builtinTool.reminders.create',
  reminder_delete_item: 'chat.builtinTool.reminders.delete',
  reminder_list_collections: 'chat.builtinTool.reminders.listLists',
  reminder_list_items: 'chat.builtinTool.reminders.list',
  reminder_update_item: 'chat.builtinTool.reminders.update',
};

type ToolPart = Extract<AgentMessagePart, { type: 'tool' }>;
export type BackgroundReplyTranslate = (key: string) => string;

export function deriveBackgroundReplyContent(
  message: BackgroundReplyMessage | undefined,
  t: BackgroundReplyTranslate,
): BackgroundReplyContent {
  const parts = message?.parts ?? [];
  const preview = extractReplyPreview(parts);
  const approval = findLastToolPart(parts, (part) => part.state === 'awaiting-approval');

  if (approval) {
    return createContent('awaiting-approval', t('chat.backgroundReply.awaitingApproval'), preview);
  }

  const activeTool = findLastToolPart(parts, isActiveToolPart);
  if (activeTool) {
    return createContent('using-tool', getToolActivityLabel(activeTool, t), preview);
  }

  if (preview) {
    return createContent('responding', t('chat.backgroundReply.responding'), preview);
  }

  if (parts.some((part) => part.type === 'reasoning')) {
    return createContent('thinking', t('chat.backgroundReply.thinking'));
  }

  return createContent('preparing', t('chat.backgroundReply.preparing'));
}

export function getTerminalBackgroundReplyContent(
  outcome: BackgroundReplyOutcome,
  preview: string | undefined,
  t: BackgroundReplyTranslate,
): BackgroundReplyContent {
  const key = `chat.backgroundReply.${outcome}` as const;
  return createContent(outcome, t(key), outcome === 'completed' ? preview : undefined);
}

export function extractReplyPreview(parts: readonly AgentMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is AgentMessagePart & { type: 'text' } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  const plainText = stripMarkdown(text);
  if (!plainText) return undefined;

  const characters = Array.from(plainText);
  if (characters.length <= PREVIEW_CHARACTER_LIMIT) return plainText;

  const tail = characters.slice(-PREVIEW_CHARACTER_LIMIT);
  const sentenceBoundary = tail.findIndex(
    (character, index) =>
      SENTENCE_ENDINGS.has(character) &&
      tail.length - index - 1 >= PREVIEW_MIN_COMPLETE_SUFFIX_LENGTH,
  );

  return sentenceBoundary >= 0
    ? tail
        .slice(sentenceBoundary + 1)
        .join('')
        .trimStart()
    : `…${characters.slice(-(PREVIEW_CHARACTER_LIMIT - 1)).join('')}`;
}

function createContent(
  phase: BackgroundReplyPhase,
  detail: string,
  preview?: string,
): BackgroundReplyContent {
  return { detail, phase, ...(preview ? { preview } : {}) };
}

function findLastToolPart(
  parts: readonly AgentMessagePart[],
  predicate: (part: ToolPart) => boolean,
): ToolPart | undefined {
  return parts.findLast((part): part is ToolPart => isToolPart(part) && predicate(part));
}

function getToolActivityLabel(part: ToolPart, t: BackgroundReplyTranslate): string {
  const toolName = getToolName(part);
  if (WEB_SEARCH_TOOL_NAMES.has(toolName)) {
    return t('chat.backgroundReply.tool.webSearch');
  }

  const builtInTitleKey = BUILT_IN_TOOL_TITLE_KEYS[toolName];
  return builtInTitleKey ? t(builtInTitleKey) : t('chat.backgroundReply.tool.generic');
}

function getToolName(part: ToolPart): string {
  switch (part.toolRef.source) {
    case 'builtin':
      return part.toolRef.capabilityId;
    case 'mcp':
      return part.toolRef.rawToolName;
    case 'meta':
      return part.toolRef.name;
  }
}

function isActiveToolPart(part: ToolPart): boolean {
  return part.state === 'input-available' || part.state === 'running';
}

function isToolPart(part: AgentMessagePart): part is ToolPart {
  return part.type === 'tool';
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```(?:[^\n]*)\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|>\s?)/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
