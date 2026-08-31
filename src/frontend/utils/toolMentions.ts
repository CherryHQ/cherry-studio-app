/**
 * Tools a message invoked by naming them in its own text.
 *
 * A mention is a Markdown link whose URL carries the tool id and whose text
 * carries the name the user saw: `[Create image](tool://create-image)`.
 *
 * The id lives in the URL rather than being recovered from the name, so a
 * message keeps meaning the same tool after the app's language changes, and so
 * ordinary prose that happens to contain the words is never mistaken for one.
 *
 * Read-only now: the composer no longer offers any tool to mention, so nothing
 * writes new ones. This stays so already-sent messages keep rendering the name
 * the user saw rather than raw link syntax.
 */

export const toolMentions = [{ id: 'create-image', titleKey: 'chat.actions.createImage' }] as const;

export type ToolMention = (typeof toolMentions)[number];
export type ToolMentionId = ToolMention['id'];

export type MentionSegment = {
  /** The tool, when this run is a mention. */
  id?: ToolMentionId;
  /** What to render — for a mention, the name only, without any link syntax. */
  text: string;
};

const toolMentionIds = new Set<string>(toolMentions.map((mention) => mention.id));
// Link text stops at `]`, so a name containing one cannot be expressed. No
// shipped name does, and a mention is inserted rather than typed, so there is
// nothing to escape here — this only has to read back what was written.
const toolMentionPattern = /\[([^\]\n]*)\]\(tool:\/\/([a-z-]+)\)/g;

/**
 * Splits message text into plain runs and mention runs, so a caller can style
 * the mentions without a Markdown renderer. Anything that is not a mention is
 * returned verbatim, including whatever Markdown the user typed by hand.
 */
export function splitToolMentions(text: string): MentionSegment[] {
  if (!text) {
    return [];
  }

  const segments: MentionSegment[] = [];
  let plainStart = 0;

  // `matchAll` rather than a manual scan: the pattern is anchored on the link
  // syntax, which cannot start inside another match.
  for (const match of text.matchAll(toolMentionPattern)) {
    const [source, label, id] = match;

    if (!toolMentionIds.has(id)) {
      continue;
    }

    if (match.index > plainStart) {
      segments.push({ text: text.slice(plainStart, match.index) });
    }

    segments.push({ id: id as ToolMentionId, text: label });
    plainStart = match.index + source.length;
  }

  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart) });
  }

  return segments;
}
