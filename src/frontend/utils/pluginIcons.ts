import icons from '@/assets/plugins/inline-icons.json';

// Text attachments need decoded raster artwork; reuse these sources in both input and messages.
export function getPluginInlineIcon(pluginId: string): { base64: string; tint: boolean } {
  switch (pluginId) {
    case 'feishu':
      return { base64: icons.feishu, tint: false };
    case 'github':
      return { base64: icons.github, tint: true };
    case 'amap':
      return { base64: icons['map-pin'], tint: true };
    default:
      return { base64: icons['file-text'], tint: true };
  }
}

export function getPluginMentionLinkStyles(color: string) {
  const entries = ['feishu', 'github', 'amap'].map((pluginId) => {
    const icon = getPluginInlineIcon(pluginId);
    return [
      `^tool://plugin/[^/]+/${pluginId}$`,
      { color, underline: false, icon: icon.base64, iconTint: icon.tint },
    ] as const;
  });
  const fallback = getPluginInlineIcon('');
  return Object.fromEntries([
    ['^tool:', { color, underline: false, icon: fallback.base64, iconTint: fallback.tint }],
    ...entries,
  ]);
}
