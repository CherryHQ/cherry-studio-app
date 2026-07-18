import { SquarePenIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDrawerActions } from '../context/DrawerProvider';

// Gap kept to both the right and bottom screen edges, so the button sits in a
// symmetric corner inset.
const edgeInset = 32;

// Pinned to the drawer's bottom-right corner and floats above the topic list,
// mirroring ChatGPT's compose button. Tint uses the app's primary theme color.
export const DrawerNewChatButton = memo(function DrawerNewChatButton() {
  const { t } = useTranslation();
  const { openNewTopic } = useDrawerActions();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      className="absolute"
      entering={FadeInDown}
      exiting={FadeOut}
      // The drawer's SafeAreaView already lifts this container above the home
      // indicator; subtract that inset so the gap to the physical bottom edge
      // matches the right-edge gap instead of stacking on top of it.
      style={{ bottom: edgeInset - insets.bottom, right: edgeInset }}
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
