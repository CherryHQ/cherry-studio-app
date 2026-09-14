import icons from '@/assets/plugins/inline-icons.json';

// Text attachments need decoded raster artwork; reuse these sources in both input and messages.
export function getPluginInlineIcon(
  pluginId: string,
  theme: string,
): { base64: string; tint: boolean } {
  switch (pluginId) {
    case 'feishu':
      return { base64: icons.feishu, tint: false };
    case 'github':
      return { base64: theme === 'dark' ? icons['github-dark'] : icons.github, tint: false };
    case 'notion':
      return { base64: theme === 'dark' ? icons['notion-dark'] : icons.notion, tint: false };
    default:
      return { base64: icons['file-text'], tint: true };
  }
}

export function getPluginMentionLinkStyles(color: string, theme: string) {
  const entries = ['feishu', 'github', 'notion'].map((pluginId) => {
    const icon = getPluginInlineIcon(pluginId, theme);
    return [
      `^tool://plugin/[^/]+/${pluginId}$`,
      { color, underline: false, icon: icon.base64, iconTint: icon.tint },
    ] as const;
  });
  const fallback = getPluginInlineIcon('', theme);
  return Object.fromEntries([
    ['^tool:', { color, underline: false, icon: fallback.base64, iconTint: fallback.tint }],
    ...entries,
  ]);
}
