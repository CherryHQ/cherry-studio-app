import type { LucideIconComponent } from '@cherrystudio/app-icons';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { Avatar } from '@cherrystudio/ui/components';
import type { ImageSource } from 'expo-image';
import { useResolveClassNames } from 'uniwind';

import opticalScales from '@/assets/plugins/optical-scales.json';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { PluginIconId } from '@/frontend/utils/pluginIcons';

const ICONS = {
  amap: { source: require('@/assets/plugins/amap.webp'), tint: false },
  dingtalk: { source: require('@/assets/plugins/dingtalk.webp'), tint: false },
  feishu: { source: require('@/assets/plugins/feishu.webp'), tint: false },
  github: { source: require('@/assets/plugins/github.webp'), tint: true },
  notion: { source: require('@/assets/plugins/notion.webp'), tint: true },
  wecom: { source: require('@/assets/plugins/wecom.webp'), tint: false },
} satisfies Record<PluginIconId, { source: number; tint: boolean }>;

const SIZES = {
  small: { size: 24, radius: 'rounded-md' },
  default: { size: 40, radius: 'rounded-xl' },
  large: { size: 48, radius: 'rounded-2xl' },
} as const;

export function PluginIcon({
  glyph: Glyph = FileTextIcon,
  icon,
  size = 'default',
  source,
}: {
  /** Interface glyph drawn when there is no artwork, such as a built-in tool's symbol. */
  glyph?: LucideIconComponent;
  icon?: string;
  size?: keyof typeof SIZES;
  /** Untinted artwork from outside the plugin catalog, such as an MCP or web search provider mark. */
  source?: ImageSource | number;
}) {
  const foreground = useThemeColor('foreground');
  const iconId = icon && Object.hasOwn(ICONS, icon) ? (icon as PluginIconId) : undefined;
  const artwork = iconId ? ICONS[iconId] : source ? { source, tint: false } : undefined;
  const scale = iconId ? opticalScales[iconId] : 0.6;
  const dimensions = SIZES[size];
  const { borderRadius } = useResolveClassNames(dimensions.radius);
  return (
    <Avatar
      accessibilityElementsHidden
      accessibilityLabel=""
      accessible={false}
      className={`${dimensions.radius} border-continuous bg-card`}
      importantForAccessibility="no-hide-descendants"
      radius={typeof borderRadius === 'number' ? borderRadius : undefined}
      shape="rounded"
      size={dimensions.size}
    >
      {artwork ? (
        <Avatar.Image
          accessible={false}
          accessibilityIgnoresInvertColors
          contentFit="contain"
          scale={scale}
          source={artwork.source}
          tintColor={artwork.tint ? foreground : undefined}
        />
      ) : (
        <Glyph className="text-foreground" size={dimensions.size * scale} />
      )}
    </Avatar>
  );
}
