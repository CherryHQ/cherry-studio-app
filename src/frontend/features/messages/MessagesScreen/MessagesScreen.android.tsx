import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { useSetBottomTabBarHidden } from '@/frontend/components/navigation';

import { MessageHeader } from '../components/MessageHeader';
import { MessagePager } from '../components/MessagePager';
import { SelectionControls } from '../components/SelectionControls';

export function MessagesScreen() {
  const router = useRouter();
  const { scope, setScope } = useMessageScope();
  const { enterEditing, exitEditing } = useMessageSelectionActions();
  const { isEditing } = useMessageSelectionState();

  // The explicit flex:1 style backs up the className so the pager fills the
  // Android scene height (paired with the navigator's sceneStyle).
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} style={{ flex: 1 }}>
      <MessageHeader
        isEditing={isEditing}
        onEditPress={isEditing ? exitEditing : enterEditing}
        onNewPaintingPress={() => router.push('/paintings')}
        onNewTopicPress={() => router.push('/topics')}
        onScopeChange={setScope}
        scope={scope}
      />
      <MessagePager showRecentsHeading />
      <SelectionControls />
    </SafeAreaView>
  );
}

export function MessagesRoute() {
  const setBottomTabBarHidden = useSetBottomTabBarHidden();

  return (
    <MessageScopeProvider>
      <MessageSelectionProvider onEditingChange={setBottomTabBarHidden}>
        <MessagesScreen />
      </MessageSelectionProvider>
    </MessageScopeProvider>
  );
}
