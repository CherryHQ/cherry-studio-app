import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/components/messageTabs';
import { useSetBottomTabBarHidden } from '@/components/navigation';

import { MessageHeader } from './components/MessageHeader';
import { MessagePager } from './components/MessagePager';
import { SelectionControls } from './components/SelectionControls';

export function MessagesScreen() {
  const router = useRouter();
  const { scope, setScope } = useMessageScope();
  const { enterEditing, exitEditing } = useMessageSelectionActions();
  const { isEditing } = useMessageSelectionState();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
