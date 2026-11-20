import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { ModelPickerBadge as ModelPickerBadgeValue } from '../utils/modelPickerBadges';

/** A compact, inert visual mark; the containing row owns its spoken label. */
export function ModelPickerBadge({
  badge,
  testIDPrefix = 'model-picker-badge',
  variant = 'chip',
}: {
  badge: ModelPickerBadgeValue;
  testIDPrefix?: string;
  variant?: 'chip' | 'icon';
}) {
  const { t } = useTranslation();
  const isFree = badge === 'free';

  return (
    <View
      accessibilityElementsHidden
      className={
        isFree
          ? 'justify-center rounded-sm bg-tag-green px-1.25'
          : variant === 'icon'
            ? 'size-4 items-center justify-center'
            : 'h-5 flex-row items-center justify-center rounded-lg bg-tag-blue px-1.5'
      }
      importantForAccessibility="no-hide-descendants"
      style={styles.badge}
      testID={`${testIDPrefix}-${badge}`}
    >
      {isFree ? (
        <Text className="font-medium text-xs text-tag-green-foreground" numberOfLines={1}>
          {t('models.badge.free')}
        </Text>
      ) : (
        <EyeIcon className="size-3 text-tag-blue-foreground" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderCurve: 'continuous',
  },
});
