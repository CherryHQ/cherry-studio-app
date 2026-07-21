import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { Stack, useRouter } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { ChevronLeftIcon, EllipsisIcon, SquarePenIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
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
  const menuActions = useMemo<MenuAction[]>(
    () => [
      {
        id: 'rename-topic',
        image: 'pencil',
        title: t('topic.actions.rename'),
      },
      {
        attributes: { disabled: topicActions.isPinActionDisabled },
        id: 'toggle-pin-topic',
        image: topicActions.isTopicPinned ? 'pin.slash' : 'pin',
        state: topicActions.isTopicPinned ? 'on' : 'off',
        title: t(topicActions.isTopicPinned ? 'topic.actions.unpin' : 'topic.actions.pin'),
      },
    ],
    [t, topicActions.isPinActionDisabled, topicActions.isTopicPinned],
  );
  const handleMenuAction = useCallback(
    (event: NativeActionEvent) => {
      const actionId = event.nativeEvent.event;

      if (actionId === 'rename-topic') {
        topicActions.openRenameTopic();
        return;
      }

      if (actionId === 'toggle-pin-topic') {
        void topicActions.toggleTopicPin();
      }
    },
    [topicActions],
  );

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
              <MenuView actions={menuActions} onPressAction={handleMenuAction}>
                <View
                  accessibilityLabel={t('topic.actions.more')}
                  accessibilityRole="button"
                  className="size-9 items-center justify-center"
                >
                  <EllipsisIcon className="size-6 text-foreground" strokeWidth={2} />
                </View>
              </MenuView>
            ) : null}
          </View>
        </View>
      </View>
      {topicActions.renameTopicDialog}
    </>
  );
}
