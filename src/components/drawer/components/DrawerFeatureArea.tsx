import { LibraryIcon } from 'lucide-uniwind';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

const StyledPressable = withUniwind(Pressable);

const featureItemHeight = 44;

export const DrawerFeatureArea = memo(function DrawerFeatureArea() {
  const { t } = useTranslation();

  return (
    <View className="px-2">
      <StyledPressable
        accessibilityLabel={t('navigation.resources')}
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-lg px-3 active:opacity-70"
        style={{ height: featureItemHeight }}
      >
        <LibraryIcon className="size-5 text-foreground" strokeWidth={2} />
        <Text className="font-medium text-base text-foreground" numberOfLines={1}>
          {t('navigation.resources')}
        </Text>
      </StyledPressable>
    </View>
  );
});
