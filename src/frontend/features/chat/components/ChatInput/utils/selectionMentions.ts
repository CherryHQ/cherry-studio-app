import { fromByteArray, toByteArray } from 'base64-js';

import {
  OfficeSelectionSchema,
  type OfficeSelection,
  type SelectionTextReference,
} from '@/shared/data/types/selectionReference';

import { createMentionLabel, isMentionEscaped, readMentionLabel } from './mentionLabels';

const SELECTION_MENTION_PATTERN = /\[((?:\\.|[^\]\\\n])+)\]\(selection:\/\/([A-Za-z0-9_-]+)\)/g;

/** The editor shows the label as a chip; the link carries the selection as base64url JSON. */
export function createSelectionMention(label: string, selection: OfficeSelection): string {
  return `[${createMentionLabel(label).replace(/[\\[\]]/g, '\\$&')}](${createSelectionMentionUrl(selection)})`;
}

export function createSelectionMentionUrl(selection: OfficeSelection): string {
  const payload = fromByteArray(new TextEncoder().encode(JSON.stringify(selection)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `selection://${payload}`;
}

function readSelection(payload: string): OfficeSelection | undefined {
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = toByteArray(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const parsed = OfficeSelectionSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Replaces selection chips with their labels. Runs after plugin and Skill parsing, so `shift` maps
 * their offsets past the link syntax removed here.
 */
export function readSelectionMentions(draft: string): {
  selectionReferences: SelectionTextReference[];
  shift: (offset: number) => number;
  text: string;
} {
  const selectionReferences: SelectionTextReference[] = [];
  const removed: { end: number; length: number }[] = [];
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(SELECTION_MENTION_PATTERN)) {
    const [source, rawLabel, payload] = match;
    if (isMentionEscaped(draft, match.index)) continue;
    const label = readMentionLabel(rawLabel);
    const selection = readSelection(payload);
    if (!label || !selection) continue;
    text += draft.slice(cursor, match.index);
    selectionReferences.push({ type: 'selection', selection, label, offset: text.length });
    text += label;
    cursor = match.index + source.length;
    removed.push({ end: cursor, length: source.length - label.length });
  }
  return {
    selectionReferences,
    shift: (offset) =>
      offset - removed.reduce((sum, item) => sum + (item.end <= offset ? item.length : 0), 0),
    text: text + draft.slice(cursor),
  };
}
