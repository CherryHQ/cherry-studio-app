import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import {
  SessionListProvider,
  useSessionActionAlerts,
  useSessionListSessions,
} from '@/frontend/features/sessions';
import { appSidebar } from '@/frontend/utils/constants';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';

import { useSidebarActions } from '../context';

export function SidebarSessionList() {
  return (
    <SessionListProvider>
      <SidebarSessionListView />
    </SessionListProvider>
  );
}

function SidebarSessionListView() {
  const { t } = useTranslation();
  const { sessions } = useSessionListSessions();
  const { requestDelete, requestRename } = useSessionActionAlerts();
  const { closeDrawer, openSessionList } = useSidebarActions('Sidebar session list');
  const visibleSessions = useMemo(
    () => sessions.slice(0, appSidebar.recentSessionLimit),
    [sessions],
  );

  return (
    <>
      {visibleSessions.map((session) => (
        <SidebarSessionRow
          key={session.id}
          onCloseDrawer={closeDrawer}
          onDelete={requestDelete}
          onRename={requestRename}
          session={session}
        />
      ))}
      <Pressable
        accessibilityLabel={t('navigation.viewAll')}
        accessibilityRole="button"
        className="w-full active:bg-sidebar-accent"
        onPress={openSessionList}
      >
        <Text className="px-5 py-2.5 text-base text-muted-foreground">
          {t('navigation.viewAll')}
        </Text>
      </Pressable>
    </>
  );
}

type SidebarSessionRowProps = {
  onCloseDrawer: () => void;
  onDelete: (session: AgentSessionEntity) => void;
  onRename: (session: AgentSessionEntity) => void;
  session: AgentSessionEntity;
};

const SidebarSessionRow = memo(function SidebarSessionRow({
  onCloseDrawer,
  onDelete,
  onRename,
  session,
}: SidebarSessionRowProps) {
  const { t } = useTranslation();
  const href = useMemo(
    () => ({ pathname: '/' as const, params: { sessionId: session.id } }),
    [session.id],
  );
  const handleRenamePress = useCallback(() => onRename(session), [onRename, session]);
  const handleDeletePress = useCallback(() => onDelete(session), [onDelete, session]);
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'rename',
        label: t('common.rename'),
        onPress: handleRenamePress,
      },
      {
        destructive: true,
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
      },
    ],
    [handleDeletePress, handleRenamePress, t],
  );

  return (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      <Pressable
        accessibilityLabel={session.title || t('session.list.untitled')}
        accessibilityRole="link"
        className="w-full active:bg-sidebar-accent"
        onPress={onCloseDrawer}
      >
        <Text className="px-5 py-2.5 text-base text-sidebar-foreground" numberOfLines={1}>
          {session.title || t('session.list.untitled')}
        </Text>
      </Pressable>
    </ContextMenuLink>
  );
});
