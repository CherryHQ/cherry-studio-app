import type {
  CherryMessagePart,
  CherryUIMessage,
} from '@cherrystudio/universal/data/types/message';

import type { BackgroundReplyContent, BackgroundReplyPhase } from './backgroundReplyTypes';

const PREVIEW_CHARACTER_LIMIT = 160;
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

type ToolPart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;
export type BackgroundReplyTranslate = (key: string) => string;

export function deriveBackgroundReplyContent(
  message: CherryUIMessage | undefined,
  t: BackgroundReplyTranslate,
): BackgroundReplyContent {
  const parts = message?.parts ?? [];
  const preview = extractReplyPreview(parts);
  const approval = findLastToolPart(parts, (part) => part.state === 'approval-requested');

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

export function getBackgroundReplyCompactLabel(
  phase: BackgroundReplyPhase,
  t: BackgroundReplyTranslate,
): string {
  switch (phase) {
    case 'awaiting-approval':
      return t('chat.backgroundReply.awaitingApproval');
    case 'cancelled':
      return t('chat.backgroundReply.cancelled');
    case 'completed':
      return t('chat.backgroundReply.completed');
    case 'failed':
      return t('chat.backgroundReply.failed');
    case 'preparing':
      return t('chat.backgroundReply.preparing');
    case 'responding':
      return t('chat.backgroundReply.responding');
    case 'thinking':
      return t('chat.backgroundReply.thinking');
    case 'using-tool':
      return t('chat.backgroundReply.tool.generic');
  }
}

export function getTerminalBackgroundReplyContent(
  outcome: 'cancelled' | 'completed' | 'failed',
  preview: string | undefined,
  t: BackgroundReplyTranslate,
): BackgroundReplyContent {
  const key = `chat.backgroundReply.${outcome}` as const;
  return createContent(outcome, t(key), outcome === 'completed' ? preview : undefined);
}

export function extractReplyPreview(parts: readonly CherryMessagePart[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<CherryMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  const plainText = stripMarkdown(text);
  if (!plainText) return undefined;

  const characters = Array.from(plainText);
  return characters.length <= PREVIEW_CHARACTER_LIMIT
    ? plainText
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
  parts: readonly CherryMessagePart[],
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
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function isActiveToolPart(part: ToolPart): boolean {
  return (
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval?.approved === true)
  );
}

function isToolPart(part: CherryMessagePart): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
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
