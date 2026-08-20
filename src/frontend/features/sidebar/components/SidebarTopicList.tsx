import type { TopicListItem } from '@cherrystudio/universal/data/api/schemas/topics';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ContextMenuLink, type ContextMenuLinkItem } from '@/frontend/components/navigation';
import {
  TopicListProvider,
  useTopicActionAlerts,
  useTopicListTopics,
} from '@/frontend/features/topics';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';

// Recent-topics rows over the shared TopicListProvider data layer, capped at
// `recentTopicLimit` with a trailing "view all" row into the full management
// page. Deliberately NOT `TopicList` — that component carries the multi-select
// editing machinery the management page needs and the sidebar does not. The
// body owns the scrolling, so these are plain rows.
export function SidebarTopicList() {
  return (
    <TopicListProvider>
      <SidebarTopicListView />
    </TopicListProvider>
  );
}

function SidebarTopicListView() {
  const { t } = useTranslation();
  const { topics } = useTopicListTopics();
  const { requestDelete, requestRename } = useTopicActionAlerts();
  const { closeDrawer, openTopicList } = useSidebarActions('Sidebar topic list');
  const visibleTopics = useMemo(() => topics.slice(0, appSidebar.recentTopicLimit), [topics]);

  return (
    <>
      {visibleTopics.map((topic) => (
        <SidebarTopicRow
          key={topic.id}
          onCloseDrawer={closeDrawer}
          onDelete={requestDelete}
          onRename={requestRename}
          topic={topic}
        />
      ))}
      <Pressable
        accessibilityLabel={t('navigation.viewAll')}
        accessibilityRole="button"
        className="w-full active:bg-sidebar-accent"
        onPress={openTopicList}
      >
        <Text className="px-5 py-2.5 text-base text-muted-foreground">
          {t('navigation.viewAll')}
        </Text>
      </Pressable>
    </>
  );
}

type SidebarTopicRowProps = {
  onCloseDrawer: () => void;
  onDelete: (topic: Topic) => void;
  onRename: (topic: Topic) => void;
  topic: TopicListItem;
};

const SidebarTopicRow = memo(function SidebarTopicRow({
  onCloseDrawer,
  onDelete,
  onRename,
  topic,
}: SidebarTopicRowProps) {
  const { t } = useTranslation();
  // Navigation itself is the Link's job; the row only closes the drawer on top
  // (the Slot underneath `Link asChild` composes both press handlers).
  const href = useMemo(
    () => ({ pathname: '/' as const, params: { topicId: topic.id } }),
    [topic.id],
  );
  const handleRenamePress = useCallback(() => onRename(topic), [onRename, topic]);
  const handleDeletePress = useCallback(() => onDelete(topic), [onDelete, topic]);
  const menuItems = useMemo<readonly ContextMenuLinkItem[]>(
    () => [
      {
        id: 'rename',
        label: t('common.rename'),
        onPress: handleRenamePress,
        systemImage: 'pencil',
      },
      {
        destructive: true,
        id: 'delete',
        label: t('common.delete'),
        onPress: handleDeletePress,
        systemImage: 'trash',
      },
    ],
    [handleDeletePress, handleRenamePress, t],
  );

  return (
    <ContextMenuLink href={href} items={menuItems} preview={false}>
      <Pressable
        accessibilityLabel={topic.name || t('navigation.newChat')}
        accessibilityRole="link"
        className="w-full active:bg-sidebar-accent"
        onPress={onCloseDrawer}
      >
        <Text className="px-5 py-2.5 text-base text-sidebar-foreground" numberOfLines={1}>
          {topic.name || t('navigation.newChat')}
        </Text>
      </Pressable>
    </ContextMenuLink>
  );
});
