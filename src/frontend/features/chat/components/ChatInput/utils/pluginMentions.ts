import type { PluginTextReference } from '@/shared/data/types/plugin';

// The leading object character belongs to the editor's native inline image.
export function createPluginMentionLabel(label: string): string {
  return `\uFFFC\u2009${label}`;
}

export function createPluginMentionUrl(serverId: string, pluginId?: string): string {
  return `tool://plugin/${serverId}${pluginId ? `/${pluginId}` : ''}`;
}

// Accept the previous server-only URL so existing drafts can still be sent.
const pluginMentionPattern =
  /\[((?:\\.|[^\]\\\n])+)\]\(tool:\/\/plugin\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*))?\)/gi;

/** Keep plain prompt text and a separate, durable snapshot of each inline reference. */
export function readPluginMentions(draft: string): {
  pluginServerIds: string[];
  pluginReferences: PluginTextReference[];
  text: string;
} {
  const ids = new Set<string>();
  const pluginReferences: PluginTextReference[] = [];
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(pluginMentionPattern)) {
    const [source, rawLabel, id, pluginId] = match;
    let precedingSlashes = 0;
    for (let index = match.index - 1; index >= 0 && draft[index] === '\\'; index--)
      precedingSlashes++;
    if (precedingSlashes % 2 === 1) continue;
    const label = rawLabel.replace(/^\uFFFC\u2009?/, '').replace(/\\([\\[\]])/g, '$1');
    if (!label) continue;
    text += draft.slice(cursor, match.index);
    ids.add(id.toLowerCase());
    if (pluginId)
      pluginReferences.push({
        type: 'plugin',
        pluginId: pluginId.toLowerCase(),
        label,
        offset: text.length,
      });
    text += label;
    cursor = match.index + source.length;
  }
  return { pluginServerIds: [...ids], pluginReferences, text: text + draft.slice(cursor) };
}
