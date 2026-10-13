import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, ContentState, type MenuItem, useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ConversationSourceBoundary } from '@/frontend/appShell/conversation';
import { useChatSource } from '@/frontend/appShell/navigation/chat';

import { useSidebarSelection, useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarConversationList } from './SidebarConversationList';
import { SidebarDesktopSource } from './SidebarDesktopSource';

type SidebarRecentsProps = {
  registerEndReachedHandler: (handler?: () => void) => void;
};

export function SidebarRecents({ registerEndReachedHandler }: SidebarRecentsProps) {
  const { t } = useTranslation();
  const { source, remoteTarget, viewMode: mode, setViewMode: setMode } = useChatSource();
  const { toast } = useToast();
  const isSelecting = useSidebarSelectionSnapshot((state) => state.isSelecting);
  const isDeleting = useSidebarSelectionSnapshot((state) => state.isDeleting);
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
    ],
    [handleModeChange, isSessionMode, t],
  );

  const modeTrigger = (
    <View
      accessibilityLabel={t('navigation.chooseSidebarView')}
      accessibilityRole="button"
      accessibilityState={{ disabled: isSelecting || isDeleting }}
      className="min-h-10 flex-row items-center gap-1.5"
      testID="sidebar-recents-mode-toggle"
    >
      <Text className="text-muted-foreground text-sm">{modeLabel}</Text>
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </View>
  );
  const header =
    isSelecting || isDeleting ? (
      modeTrigger
    ) : (
      <ActionMenu items={menuItems}>{modeTrigger}</ActionMenu>
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
      {/* The whole break below the navigation rows, which add no trailing space of their own. */}
      <View className="flex-row items-center justify-between gap-2 px-5 pt-2 pb-1">
        {isSelecting ? <SidebarSelectionHeader /> : header}
      </View>
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

function SidebarSelectionHeader() {
  const { t } = useTranslation();
  const selection = useSidebarSelection();
  const selectedCount = useSidebarSelectionSnapshot((state) => state.selectedIds.size);
  const isDeleting = useSidebarSelectionSnapshot((state) => state.isDeleting);
  const allSelected = useSidebarSelectionSnapshot(() => selection.allSelected());
  const selectableCount = useSidebarSelectionSnapshot(() => selection.shownIds().length);
  const disabled = isDeleting || !selectableCount;

  return (
    <>
      <Text
        className="min-w-0 flex-1 text-muted-foreground text-sm"
        accessibilityLiveRegion="polite"
      >
        {t('common.selection.count', { count: selectedCount })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={4}
        onPress={selection.toggleAll}
        style={({ pressed }) => ({
          justifyContent: 'center',
          maxWidth: '60%',
          minHeight: 44,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        })}
        testID="sidebar-select-all"
      >
        <Text className="text-right text-sidebar-foreground text-sm">
          {t(allSelected ? 'session.selection.deselectAll' : 'common.selection.selectAll')}
        </Text>
      </Pressable>
    </>
  );
}
