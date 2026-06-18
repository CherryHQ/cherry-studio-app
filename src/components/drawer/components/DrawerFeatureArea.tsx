import { BotIcon, LibraryIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useDrawerActions } from '../context/DrawerProvider';

const featureItemHeight = 44;

export const DrawerFeatureArea = memo(function DrawerFeatureArea() {
  const { t } = useTranslation();
  const { openAssistants } = useDrawerActions();

  return (
    <View className="gap-1 px-2">
      <Pressable
        accessibilityLabel={t('navigation.resources')}
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-lg px-3 active:opacity-70"
        style={{ height: featureItemHeight }}
      >
        <LibraryIcon className="size-5 text-foreground" strokeWidth={2} />
        <Text className="font-medium text-base text-foreground" numberOfLines={1}>
          {t('navigation.resources')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={t('navigation.assistants')}
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-lg px-3 active:opacity-70"
        onPress={openAssistants}
        style={{ height: featureItemHeight }}
      >
        <BotIcon className="size-5 text-default-foreground" strokeWidth={2} />
        <Text className="font-medium text-base text-default-foreground" numberOfLines={1}>
          {t('navigation.assistants')}
        </Text>
      </Pressable>
    </View>
  );
});
