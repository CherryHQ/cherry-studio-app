import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import GiftIcon from '@cherrystudio/app-icons/icons/gift';
import { StyleSheet, View } from 'react-native';

import type { ProviderModelBadge as ProviderModelBadgeValue } from '../utils/providerModelBadges';

const badgeMeta = {
  free: {
    chipClassName: 'bg-tag-green',
    Icon: GiftIcon,
    iconClassName: 'text-tag-green-foreground',
  },
  vision: {
    chipClassName: 'bg-tag-blue',
    Icon: EyeIcon,
    iconClassName: 'text-tag-blue-foreground',
  },
} satisfies Record<
  ProviderModelBadgeValue,
  { chipClassName: string; Icon: typeof EyeIcon; iconClassName: string }
>;

/** A compact, inert visual mark; the containing row owns its spoken label. */
export function ProviderModelBadge({ badge }: { badge: ProviderModelBadgeValue }) {
  const { chipClassName, Icon, iconClassName } = badgeMeta[badge];

  return (
    <View
      accessibilityElementsHidden
      className={`h-5 flex-row items-center justify-center rounded-lg px-1.5 ${chipClassName}`}
      importantForAccessibility="no-hide-descendants"
      style={styles.badge}
      testID={`provider-model-badge-${badge}`}
    >
      <Icon className={`size-3 ${iconClassName}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderCurve: 'continuous',
  },
});
