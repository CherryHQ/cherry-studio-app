import { ImageIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';

export function DrawingList() {
  const { t } = useTranslation();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View
      className="flex-1 items-center justify-center gap-3 bg-background px-6"
      style={{ paddingBottom: tabBarHeight }}
    >
      <ImageIcon className="size-9 text-foreground-muted" strokeWidth={1.5} />
      <Text className="text-center text-default-foreground text-sm">
        {t('topic.drawings.empty')}
      </Text>
    </View>
  );
}
