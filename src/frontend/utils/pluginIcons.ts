import icons from '@/assets/plugins/inline-icons.json';

const PLUGIN_INLINE_ICONS = {
  amap: { light: icons.amap, dark: icons.amap },
  dingtalk: { light: icons.dingtalk, dark: icons.dingtalk },
  feishu: { light: icons.feishu, dark: icons.feishu },
  github: { light: icons.github, dark: icons['github-dark'] },
  notion: { light: icons.notion, dark: icons['notion-dark'] },
  wecom: { light: icons.wecom, dark: icons.wecom },
};

export type PluginIconId = keyof typeof PLUGIN_INLINE_ICONS;

// Text attachments need decoded raster artwork; reuse these sources in both input and messages.
export function getPluginInlineIcon(
  pluginId: string,
  theme: string,
): { base64: string; tint: boolean } {
  if (Object.hasOwn(PLUGIN_INLINE_ICONS, pluginId)) {
    const artwork = PLUGIN_INLINE_ICONS[pluginId as PluginIconId];
    return { base64: theme === 'dark' ? artwork.dark : artwork.light, tint: false };
  }
  return { base64: icons['file-text'], tint: true };
}

export function getPluginMentionLinkStyles(color: string, theme: string) {
  const entries = Object.keys(PLUGIN_INLINE_ICONS).map((pluginId) => {
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
