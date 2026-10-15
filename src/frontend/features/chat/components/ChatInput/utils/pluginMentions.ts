import type { PluginTextReference } from '@/shared/data/types/plugin';

import { isMentionEscaped, readMentionLabel } from './mentionLabels';

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
    if (isMentionEscaped(draft, match.index)) continue;
    const label = readMentionLabel(rawLabel);
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
