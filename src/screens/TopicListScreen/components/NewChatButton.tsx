import { SquarePenIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { useTopicListActions } from '../context/TopicListProvider';

const horizontalInset = 24;
const verticalInset = 16;

export const NewChatButton = memo(function NewChatButton() {
  const { t } = useTranslation();
  const { openNewTopic } = useTopicListActions();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <Animated.View
      className="absolute"
      entering={FadeInDown}
      exiting={FadeOut}
      style={{ bottom: tabBarHeight + verticalInset, right: horizontalInset }}
    >
      <Pressable
        accessibilityLabel={t('navigation.newChat')}
        accessibilityRole="button"
        className="flex-row items-center gap-2 rounded-full bg-primary px-5 py-3 active:opacity-80"
        onPress={openNewTopic}
        style={styles.shadow}
      >
        <SquarePenIcon className="size-5 text-white" strokeWidth={2} />
        <Text className="font-semibold text-base text-white">{t('navigation.newChat')}</Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shadow: {
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
  },
});
