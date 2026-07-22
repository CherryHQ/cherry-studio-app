import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/components/messageTabs';
import { useSetBottomTabBarHidden } from '@/components/navigation';

import { TopicListHeader } from './components/TopicListHeader';
import { TopicListPager } from './components/TopicListPager';
import { TopicSelectionControls } from './components/TopicSelectionControls';
import { TopicListProvider, useTopicListActions } from './context/TopicListProvider';

export function TopicListScreen() {
  const { openNewPainting, openNewTopic } = useTopicListActions();
  const { scope, setScope } = useMessageScope();
  const { enterEditing, exitEditing } = useMessageSelectionActions();
  const { isEditing } = useMessageSelectionState();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TopicListHeader
        isEditing={isEditing}
        onEditPress={isEditing ? exitEditing : enterEditing}
        onNewPaintingPress={openNewPainting}
        onNewTopicPress={openNewTopic}
        onScopeChange={setScope}
        scope={scope}
      />
      <TopicListPager showRecentsHeading />
      <TopicSelectionControls />
    </SafeAreaView>
  );
}

export function TopicListRoute() {
  const setBottomTabBarHidden = useSetBottomTabBarHidden();

  return (
    <TopicListProvider>
      <MessageScopeProvider>
        <MessageSelectionProvider onEditingChange={setBottomTabBarHidden}>
          <TopicListScreen />
        </MessageSelectionProvider>
      </MessageScopeProvider>
    </TopicListProvider>
  );
}
