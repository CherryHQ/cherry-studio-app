import { SafeAreaView } from 'react-native-safe-area-context';

import { useSetBottomTabBarHidden } from '@/components/navigation';

import { TopicListHeader } from './components/TopicListHeader';
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
  const { openNewPainting, openNewTopic } = useTopicListActions();
  const { scope } = useTopicListScope();
  const { enterEditing, exitEditing } = useTopicListSelectionActions();
  const { isEditing } = useTopicListSelectionState();
  const isConversationScope = scope === 'conversations';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TopicListHeader
        isEditing={isEditing}
        isEditVisible={isConversationScope}
        onEditPress={isEditing ? exitEditing : enterEditing}
        onNewPaintingPress={openNewPainting}
        onNewTopicPress={openNewTopic}
      />
      <TopicListScopeTabs isVisible={!isEditing} />
      <TopicListPager showRecentsHeading />
      <TopicSelectionControls />
    </SafeAreaView>
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
