import { Stack, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useMainHeaderTopicActions } from './useMainHeaderTopicActions';

export function MainHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const topicActions = useMainHeaderTopicActions();

  const openNewTopic = useCallback(() => {
    router.setParams({ topicId: undefined });
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: '',
          title: '',
          headerTransparent: true,
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.newChat')}
          icon="square.and.pencil"
          onPress={openNewTopic}
        />
        <Stack.Toolbar.Menu
          accessibilityLabel={t('topic.actions.more')}
          hidden={!topicActions.isTopicActionsVisible}
          icon="ellipsis.circle"
        >
          <Stack.Toolbar.MenuAction icon="pencil" onPress={topicActions.openRenameTopic}>
            {t('topic.actions.rename')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            disabled={topicActions.isPinActionDisabled}
            icon={topicActions.isTopicPinned ? 'pin.slash' : 'pin'}
            isOn={topicActions.isTopicPinned}
            onPress={() => void topicActions.toggleTopicPin()}
          >
            {t(topicActions.isTopicPinned ? 'topic.actions.unpin' : 'topic.actions.pin')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      {topicActions.renameTopicDialog}
    </>
  );
}
