import { type ReactElement } from 'react';
import { View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { MoreModuleId } from './dockTabs';
import { NavIcon } from './NavIcon';

type NavCardBadgeProps = {
  id: MoreModuleId;
  size?: number;
};

/** Tinted squircle module icon badge matching the 「更多」 grid cards. */
export function NavCardBadge({ id, size = 20 }: NavCardBadgeProps): ReactElement {
  const [amberFg, chart2Color, greenFg, infoFg, redFg] = useThemeColor([
    'tag-amber-foreground',
    'chart-2',
    'tag-green-foreground',
    'info-subtle-foreground',
    'tag-red-foreground',
  ]);

  if (id === 'drawings') {
    return (
      <View className="bg-tag-amber h-10 w-10 items-center justify-center rounded-xl">
        <NavIcon color={amberFg} id="drawings" size={size} />
      </View>
    );
  }

  if (id === 'plugins') {
    return (
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
        <View className="bg-chart-2 absolute inset-0 opacity-15" />
        <NavIcon color={chart2Color} id="plugins" size={size} />
      </View>
    );
  }

  if (id === 'marketplace') {
    return (
      <View className="bg-tag-green h-10 w-10 items-center justify-center rounded-xl">
        <NavIcon color={greenFg} id="marketplace" size={size} />
      </View>
    );
  }

  if (id === 'files') {
    return (
      <View className="bg-info-subtle h-10 w-10 items-center justify-center rounded-xl">
        <NavIcon color={infoFg} id="files" size={size} />
      </View>
    );
  }

  return (
    <View className="bg-tag-red h-10 w-10 items-center justify-center rounded-xl">
      <NavIcon color={redFg} id="devices" size={size} />
    </View>
  );
}
