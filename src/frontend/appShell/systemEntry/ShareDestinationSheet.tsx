import { BottomSheet, Button, ContentState, SearchField } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAgentApiById, useAgentSessions } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';

export type ShareDestination =
  | { kind: 'draft'; agentId: string }
  | { kind: 'session'; sessionId: string };

type ShareDestinationSheetProps = {
  open: boolean;
  /** The caller decides which Agent receives a new conversation. */
  defaultAgentId?: string;
  /** Abandon selection without changing routes. */
  onCancel: () => void;
  /** The caller owns navigation and the unsent share. */
  onSelect(destination: ShareDestination): void;
};

export function ShareDestinationSheet({
  defaultAgentId,
  onCancel,
  onSelect,
  open,
}: ShareDestinationSheetProps) {
  const { t } = useTranslation();
  const [isChoosingExisting, setIsChoosingExisting] = useState(false);

  // Reset the choice on a controlled close while retaining the sheet's dismissal lifecycle.
  if (!open && isChoosingExisting) setIsChoosingExisting(false);

  return (
    <BottomSheet
      avoidKeyboard
      backAction={
        isChoosingExisting
          ? {
              accessibilityLabel: t('systemEntry.destination.back'),
              onPress: () => setIsChoosingExisting(false),
            }
          : undefined
      }
      closeAction={{ accessibilityLabel: t('systemEntry.destination.cancel') }}
      footer={
        <Button
          accessibilityLabel={t('systemEntry.destination.cancel')}
          onPress={onCancel}
          testID="share-destination-cancel"
          variant="secondary"
        >
          <Button.Label>{t('systemEntry.destination.cancel')}</Button.Label>
        </Button>
      }
      onClose={onCancel}
      open={open}
      size="medium"
      testID="share-destination-sheet"
      title={t(
        isChoosingExisting ? 'systemEntry.destination.existing' : 'systemEntry.destination.title',
      )}
    >
      {isChoosingExisting ? (
        <ShareDestinationSessions onSelect={onSelect} />
      ) : (
        <View className="gap-3 px-4 pt-2 pb-4">
          <Button
            accessibilityLabel={t('systemEntry.destination.new')}
            disabled={!defaultAgentId}
            onPress={() => {
              if (defaultAgentId) onSelect({ kind: 'draft', agentId: defaultAgentId });
            }}
            testID="share-destination-new"
            variant="secondary"
          >
            <Button.Label>{t('systemEntry.destination.new')}</Button.Label>
          </Button>
          {!defaultAgentId ? (
            <Text className="text-muted-foreground text-sm">
              {t('systemEntry.destination.noAgent')}
            </Text>
          ) : null}
          <Button
            accessibilityLabel={t('systemEntry.destination.existing')}
            onPress={() => setIsChoosingExisting(true)}
            testID="share-destination-existing"
            variant="secondary"
          >
            <Button.Label>{t('systemEntry.destination.existing')}</Button.Label>
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}

function ShareDestinationSessions({ onSelect }: Pick<ShareDestinationSheetProps, 'onSelect'>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const catalog = useAgentSessions();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const sessions = catalog.sessions.filter((session) => session.name.toLowerCase().includes(query));

  return (
    <View className="min-h-0 flex-1 gap-3">
      <View className="px-4 pt-2">
        <SearchField
          accessibilityLabel={t('systemEntry.destination.search')}
          clearAccessibilityLabel={t('systemEntry.destination.clearSearch')}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder={t('systemEntry.destination.search')}
          testID="share-destination-search"
          value={search}
        />
      </View>
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-2 px-4 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {catalog.isLoadingInitial ? (
          <ContentState.Loading title={t('systemEntry.destination.loading')} />
        ) : catalog.error ? (
          <ContentState.Error
            primaryAction={{
              accessibilityLabel: t('systemEntry.destination.retry'),
              children: t('systemEntry.destination.retry'),
              onPress: () => void queryClient.invalidateQueries({ queryKey: ['/agent-sessions'] }),
            }}
            title={t('systemEntry.destination.loadFailed')}
          />
        ) : sessions.length === 0 ? (
          <ContentState.Empty
            title={t(query ? 'systemEntry.destination.noResults' : 'systemEntry.destination.empty')}
          />
        ) : (
          sessions.map((session) => (
            <ShareDestinationSessionRow key={session.id} onSelect={onSelect} session={session} />
          ))
        )}
        {!catalog.isLoadingInitial && !catalog.error && catalog.hasMore ? (
          <Button
            accessibilityLabel={t('systemEntry.destination.loadMore')}
            disabled={catalog.isLoadingMore}
            loading={catalog.isLoadingMore}
            onPress={() => void catalog.loadMore()}
            testID="share-destination-load-more"
            variant="ghost"
          >
            <Button.Label>{t('systemEntry.destination.loadMore')}</Button.Label>
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ShareDestinationSessionRow({
  onSelect,
  session,
}: Pick<ShareDestinationSheetProps, 'onSelect'> & { session: AgentSessionEntity }) {
  const { t } = useTranslation();
  const { agent, error, isLoading } = useAgentApiById(session.agentId);
  // Sessions survive Agent deletion (DeleteAgentResult); the session schema has no availability
  // flag. Resolve the exact Agent rather than inferring deletion from a capped catalog page.
  const isUnavailable = !agent || Boolean(error) || isLoading;
  const title = session.name.trim() || t('systemEntry.destination.untitled');
  const source = t('systemEntry.destination.agentSource', {
    name: agent?.name ?? session.agentId,
    id: session.agentId,
  });
  const status = isLoading
    ? t('systemEntry.destination.checkingAgent')
    : isUnavailable
      ? t('systemEntry.destination.unavailable')
      : undefined;

  return (
    <Pressable
      accessibilityLabel={[title, source, status].filter(Boolean).join(', ')}
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, disabled: isUnavailable }}
      className="min-h-12 gap-1 rounded-xl py-3 active:bg-secondary"
      disabled={isUnavailable}
      onPress={() => {
        if (!isUnavailable) onSelect({ kind: 'session', sessionId: session.id });
      }}
      testID={`share-destination-session-${session.id}`}
    >
      <Text className="font-semibold text-base text-foreground">{title}</Text>
      <Text className="text-muted-foreground text-sm">{source}</Text>
      {status ? <Text className="text-muted-foreground text-sm">{status}</Text> : null}
    </Pressable>
  );
}
