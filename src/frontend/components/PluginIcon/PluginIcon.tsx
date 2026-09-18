import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { Avatar } from '@cherrystudio/ui/components';
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
  icon,
  size = 'default',
}: {
  icon?: string;
  size?: keyof typeof SIZES;
}) {
  const foreground = useThemeColor('foreground');
  const iconId = icon && Object.hasOwn(ICONS, icon) ? (icon as PluginIconId) : undefined;
  const artwork = iconId ? ICONS[iconId] : undefined;
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
        <FileTextIcon className="text-foreground" size={dimensions.size * scale} />
      )}
    </Avatar>
  );
}
