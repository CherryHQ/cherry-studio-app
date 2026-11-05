import { ContentState, ScrollInteractionBoundary } from '@cherrystudio/ui/components';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationSourceBoundary } from '@/frontend/appShell/conversation';
import { RouteHeader, RouteHeaderProvider } from '@/frontend/appShell/header';
import { ReadingContentFrame } from '@/frontend/appShell/layout';
import {
  ConversationDestinationList,
  type ConversationDestination,
} from '@/frontend/appShell/sidebar';
import { useSystemShareDestination } from '@/frontend/appShell/systemEntry';

/** A destination-only page; shared content remains owned by the app-shell bridge. */
export function ShareDestinationScreen() {
  const { t } = useTranslation();
  const { isPending, cancel, select } = useSystemShareDestination();
  const focused = useIsFocused();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isPending || !focused) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [focused, isPending, router]);

  const onSelect = (destination: ConversationDestination) => {
    if (destination.kind === 'agent') {
      select({ kind: 'draft', agentId: destination.agent.id });
    } else if (destination.session.ref.source.kind === 'local') {
      select({ kind: 'session', sessionId: destination.session.ref.sessionId });
    }
  };

  return (
    <>
      <RouteHeaderProvider rootAction="close">
        <RouteHeader title={t('systemEntry.destination.title')} onBack={cancel} />
      </RouteHeaderProvider>
      <ReadingContentFrame>
        <ScrollInteractionBoundary>
          {(scrollHandlers) => (
            <ScrollView
              {...scrollHandlers}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 16 }}
              contentInsetAdjustmentBehavior="automatic"
              showsVerticalScrollIndicator={false}
              testID="share-destination-list"
            >
              <ConversationSourceBoundary
                source={{ kind: 'local' }}
                fallback={renderSourceFallback}
              >
                <ConversationDestinationList onSelect={onSelect} />
              </ConversationSourceBoundary>
            </ScrollView>
          )}
        </ScrollInteractionBoundary>
      </ReadingContentFrame>
    </>
  );
}

function renderSourceFallback(state: 'loading' | 'error') {
  return <SourceFallback state={state} />;
}

function SourceFallback({ state }: { state: 'loading' | 'error' }) {
  const { t } = useTranslation();
  return (
    <View className="px-5 py-4">
      {state === 'loading' ? (
        <ContentState.Loading title={t('agent.list.loading')} />
      ) : (
        <ContentState.Error title={t('agent.list.loadFailed')} />
      )}
    </View>
  );
}
