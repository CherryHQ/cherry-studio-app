import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSetBottomTabBarHidden } from '@/components/navigation';
import { isLiquidGlassAvailable } from '@/config/constants';

import { TopicListPager } from './components/TopicListPager';
import { TopicListScopeTabs } from './components/TopicListScopeTabs';
import { TopicSelectionControls } from './components/TopicSelectionControls';
import { TopicListProvider, useTopicListActions } from './context/TopicListProvider';
import { TopicListScopeProvider, useTopicListScope } from './context/TopicListScopeProvider';
import {
  TopicListSelectionProvider,
  useTopicListSelectionActions,
  useTopicListSelectionState,
} from './context/TopicListSelectionProvider';

export function TopicListScreen() {
  const { t } = useTranslation();
  const { openNewPainting, openNewTopic } = useTopicListActions();
  const { scope, setScope } = useTopicListScope();
  const { enterEditing, exitEditing } = useTopicListSelectionActions();
  const { isEditing } = useTopicListSelectionState();
  const headerHeight = useHeaderHeight();
  const isConversationScope = scope === 'conversations';

  return (
    <>
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: isLiquidGlassAvailable ? headerHeight : 0 }}
      >
        <TopicListPager />
        <TopicSelectionControls />
      </View>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
        }}
      />
      {isEditing ? (
        <Stack.Title>
          {t(isConversationScope ? 'navigation.messages' : 'painting.history.title')}
        </Stack.Title>
      ) : (
        <Stack.Title asChild>
          <TopicListScopeTabs scope={scope} onScopeChange={setScope} />
        </Stack.Title>
      )}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t(isEditing ? 'common.done' : 'common.edit')}
          onPress={isEditing ? exitEditing : enterEditing}
        >
          {t(isEditing ? 'common.done' : 'common.edit')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel={t('navigation.new')}
          hidden={isEditing}
          icon="square.and.pencil"
        >
          <Stack.Toolbar.MenuAction icon="message" onPress={openNewTopic}>
            {t('navigation.newChat')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="paintbrush" onPress={openNewPainting}>
            {t('navigation.newPainting')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}

export function TopicListRoute() {
  const setBottomTabBarHidden = useSetBottomTabBarHidden();

  return (
    <TopicListProvider>
      <TopicListScopeProvider>
        <TopicListSelectionProvider onEditingChange={setBottomTabBarHidden}>
          <TopicListScreen />
        </TopicListSelectionProvider>
      </TopicListScopeProvider>
    </TopicListProvider>
  );
}
