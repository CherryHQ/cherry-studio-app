import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, ContentState, type MenuItem, useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ConversationSourceBoundary } from '@/frontend/appShell/conversation';
import { useChatSource } from '@/frontend/appShell/navigation/chat';

import { SidebarConversationList } from './SidebarConversationList';
import { SidebarDesktopSource } from './SidebarDesktopSource';

type SidebarRecentsProps = {
  registerEndReachedHandler: (handler?: () => void) => void;
};

export function SidebarRecents({ registerEndReachedHandler }: SidebarRecentsProps) {
  const { t } = useTranslation();
  const {
    source,
    remoteTarget,
    selectSource,
    viewMode: mode,
    setViewMode: setMode,
  } = useChatSource();
  const { toast } = useToast();
  const loadingKey = `${source}:${remoteTarget.connectionId ?? ''}:${mode}`;
  const [loadingFeedback, setLoadingFeedback] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => setLoadingFeedback(loadingKey), 200);
    return () => clearTimeout(timer);
  }, [loadingKey]);
  const showLoading = source === 'local' || loadingFeedback === loadingKey;
  const isSessionMode = mode === 'sessions';
  const modeLabel = t(isSessionMode ? 'navigation.sessions' : 'navigation.agents');
  const handleModeChange = useCallback(
    (nextMode: 'sessions' | 'agents') => {
      void setMode(nextMode).catch(() => {
        toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
      });
    },
    [setMode, t, toast],
  );
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        checked: isSessionMode,
        group: 'view',
        id: 'show-sessions',
        label: t('navigation.sessions'),
        onPress: () => handleModeChange('sessions'),
      },
      {
        checked: !isSessionMode,
        group: 'view',
        id: 'show-agents',
        label: t('navigation.agents'),
        onPress: () => handleModeChange('agents'),
      },
      {
        group: 'source',
        checked: source === 'local',
        id: 'source-local',
        label: t('navigation.local'),
        onPress: () => selectSource('local'),
      },
      {
        group: 'source',
        checked: source === 'remote',
        id: 'source-remote',
        label: t('navigation.remote'),
        onPress: () => selectSource('remote'),
      },
    ],
    [handleModeChange, isSessionMode, source, selectSource, t],
  );

  const header = (
    <ActionMenu items={menuItems}>
      <View
        accessibilityLabel={t('navigation.chooseSidebarView')}
        accessibilityRole="button"
        className="min-h-10 flex-row items-center gap-1.5"
        testID="sidebar-recents-mode-toggle"
      >
        <Text className="text-muted-foreground text-sm">
          {modeLabel}
          {source === 'remote' ? ` · ${t('navigation.remote')}` : ''}
        </Text>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </View>
    </ActionMenu>
  );
  const content = (
    <SidebarConversationList
      key={mode}
      mode={mode}
      showLoading={showLoading}
      registerEndReachedHandler={registerEndReachedHandler}
    />
  );
  if (source === 'remote')
    return (
      <SidebarDesktopSource header={header} showLoading={showLoading}>
        {content}
      </SidebarDesktopSource>
    );
  return (
    <>
      <View className="px-5 pt-4 pb-1">{header}</View>
      <ConversationSourceBoundary
        source={{ kind: 'local' }}
        fallback={(state) =>
          state === 'loading' ? (
            showLoading ? (
              <View className="py-4">
                <ContentState.Loading title={t('session.list.loading')} />
              </View>
            ) : null
          ) : (
            <View className="px-5 py-4">
              <ContentState.Error title={t('session.list.loadFailed')} />
            </View>
          )
        }
      >
        {content}
      </ConversationSourceBoundary>
    </>
  );
}
