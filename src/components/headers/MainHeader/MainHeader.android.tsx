import { Stack, useRouter } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { Menu } from 'heroui-native/menu';
import {
  ChevronLeftIcon,
  EllipsisIcon,
  PencilIcon,
  PinIcon,
  SquarePenIcon,
} from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '../components/HeaderIconButton';
import { useMainHeaderTopicActions } from './useMainHeaderTopicActions';

export function MainHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const separatorColor = useThemeColor('separator');
  const topicActions = useMainHeaderTopicActions();

  const openNewTopic = useCallback(() => {
    router.setParams({ topicId: undefined });
  }, [router]);
  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        className="bg-background"
        style={{ borderBottomColor: separatorColor, borderBottomWidth: StyleSheet.hairlineWidth }}
      >
        <View style={{ height: insets.top }} />
        <View className="h-11 flex-row items-center justify-between px-4">
          <HeaderIconButton accessibilityLabel={t('navigation.back')} onPress={goBack}>
            <ChevronLeftIcon className="size-6 text-foreground" strokeWidth={2} />
          </HeaderIconButton>
          <View className="flex-row items-center">
            <HeaderIconButton accessibilityLabel={t('navigation.newChat')} onPress={openNewTopic}>
              <SquarePenIcon className="size-6 text-foreground" strokeWidth={2} />
            </HeaderIconButton>
            {topicActions.isTopicActionsVisible ? (
              <Menu presentation="popover">
                <Menu.Trigger asChild>
                  <Pressable
                    accessibilityLabel={t('topic.actions.more')}
                    accessibilityRole="button"
                    className="size-9 items-center justify-center active:opacity-60"
                    hitSlop={8}
                    testID="topic-actions-menu"
                  >
                    <EllipsisIcon className="size-6 text-foreground" strokeWidth={2} />
                  </Pressable>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Overlay />
                  <Menu.Content align="end" placement="bottom" presentation="popover" width={210}>
                    <Menu.Item
                      className="flex-row items-center gap-3"
                      onPress={topicActions.openRenameTopic}
                      testID="topic-actions-rename"
                    >
                      <PencilIcon className="size-5 text-foreground" strokeWidth={2} />
                      <Menu.ItemTitle>{t('topic.actions.rename')}</Menu.ItemTitle>
                    </Menu.Item>
                    <Menu.Item
                      className="flex-row items-center gap-3"
                      isDisabled={topicActions.isPinActionDisabled}
                      isSelected={topicActions.isTopicPinned}
                      onPress={() => void topicActions.toggleTopicPin()}
                      testID="topic-actions-toggle-pin"
                    >
                      <PinIcon className="size-5 text-foreground" strokeWidth={2} />
                      <Menu.ItemTitle>
                        {t(
                          topicActions.isTopicPinned ? 'topic.actions.unpin' : 'topic.actions.pin',
                        )}
                      </Menu.ItemTitle>
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu>
            ) : null}
          </View>
        </View>
      </View>
      {topicActions.renameTopicDialog}
    </>
  );
}
