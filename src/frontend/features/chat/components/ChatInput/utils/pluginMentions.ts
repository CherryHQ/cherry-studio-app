/** Composer-only links carry connection identity independently of the translated label. */
const pluginMentionPattern =
  /\[((?:\\.|[^\]\\\n])+)\]\(tool:\/\/plugin\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\)/gi;

export function createPluginMentionUrl(serverId: string): string {
  return `tool://plugin/${serverId}`;
}

/** Internal connection URLs never become prompt text or external links in the transcript. */
export function readPluginMentions(draft: string): { pluginServerIds: string[]; text: string } {
  const ids = new Set<string>();
  const text = draft.replace(
    pluginMentionPattern,
    (source, label: string, id: string, offset: number) => {
      let precedingSlashes = 0;
      for (let index = offset - 1; index >= 0 && draft[index] === '\\'; index--) {
        precedingSlashes++;
      }
      if (precedingSlashes % 2 === 1) return source;
      ids.add(id.toLowerCase());
      return label.replace(/\\([\\[\]])/g, '$1');
    },
  );
  return { pluginServerIds: [...ids], text };
}
