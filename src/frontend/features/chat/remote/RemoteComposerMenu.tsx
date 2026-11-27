import CheckIcon from '@cherrystudio/app-icons/icons/check';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';

import type { useConversationWorkspaces, WorkspaceSummary } from '@/frontend/appShell/conversation';

import { ChatToolsMenu, ChatToolsMenuRow } from '../components/ChatInput';

export const REMOTE_MAX_ATTACHMENTS = 8;

type RemoteComposerMenuProps = {
  attachmentsCount: number;
  canChangeWorkspace: boolean;
  enabled: boolean;
  onSelectWorkspace: (workspace: WorkspaceSummary) => void;
  selectedWorkspace?: WorkspaceSummary;
  showWorkspaceRow: boolean;
  supportsAttachments: boolean;
  workspaceValue?: string;
  workspaces: ReturnType<typeof useConversationWorkspaces>;
};

/** Reuses the shared chat `+` tools sheet for remote media/file attachments and PC workspace selection. */
export function RemoteComposerMenu({
  attachmentsCount,
  canChangeWorkspace,
  enabled,
  onSelectWorkspace,
  selectedWorkspace,
  showWorkspaceRow,
  supportsAttachments,
  workspaceValue,
  workspaces,
}: RemoteComposerMenuProps) {
  const { t } = useTranslation();
  const workspaceRef = useRef<ViewInstance>(null);

  return (
    <ChatToolsMenu<'workspace'>
      allowCreateFolder={false}
      enabled={enabled}
      maxAttachments={REMOTE_MAX_ATTACHMENTS}
      media={supportsAttachments ? 'all' : 'none'}
      mediaDisabled={attachmentsCount >= REMOTE_MAX_ATTACHMENTS}
      renderRows={(menu) =>
        showWorkspaceRow ? (
          <ChatToolsMenuRow
            icon={<FolderIcon className="size-5 text-muted-foreground" />}
            label={t('remoteAgent.workspaceLabel')}
            value={workspaceValue}
            onPress={canChangeWorkspace ? () => menu.openPanel('workspace') : undefined}
            ref={workspaceRef}
            testID="remote-composer-workspace"
          />
        ) : null
      }
      renderPanels={(menu) =>
        menu.panel === 'workspace' && canChangeWorkspace ? (
          <RemoteWorkspaceSheet
            disabled={!canChangeWorkspace}
            onClose={menu.closePanel}
            onClosed={menu.onPanelClosed}
            onSelect={(item) => {
              onSelectWorkspace(item);
              menu.closePanel();
            }}
            open={menu.open}
            presentation="overlay"
            returnFocusRef={workspaceRef}
            selectedWorkspace={selectedWorkspace}
            workspaces={workspaces}
          />
        ) : null
      }
    />
  );
}

/** PC workspace picker sheet supporting both overlay presentation in the tools menu and standalone guidance. */
export function RemoteWorkspaceSheet({
  disabled = false,
  onClose,
  onClosed,
  onSelect,
  open,
  presentation = 'default',
  returnFocusRef,
  selectedWorkspace,
  workspaces,
}: {
  disabled?: boolean;
  onClose: () => void;
  onClosed?: () => void;
  onSelect: (workspace: WorkspaceSummary) => void;
  open: boolean;
  presentation?: 'default' | 'overlay';
  returnFocusRef?: RefObject<ViewInstance | null>;
  selectedWorkspace?: WorkspaceSummary;
  workspaces: ReturnType<typeof useConversationWorkspaces>;
}) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      onClose={onClose}
      onClosed={onClosed}
      open={open}
      presentation={presentation}
      returnFocusRef={returnFocusRef}
      sizes={presentation === 'overlay' ? ['large', 'full'] : ['medium', 'large']}
      testID="remote-workspace-sheet"
      title={t('remoteAgent.workspace')}
    >
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-1 px-5 py-2"
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="always"
      >
        {workspaces.items.map((item) => {
          const label = item.kind === 'system' ? t('remoteAgent.systemWorkspace') : item.name;
          const selected = selectedWorkspace?.ref === item.ref;
          return (
            <Pressable
              key={item.ref}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              className="min-h-14 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-40"
              disabled={disabled}
              onPress={() => onSelect(item)}
              testID={
                item.kind === 'system'
                  ? 'remote-workspace-option-system'
                  : `remote-workspace-option-${item.id}`
              }
            >
              <FolderIcon className="size-5 text-muted-foreground" />
              <Text
                className="min-w-0 flex-1 text-base text-foreground"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {label}
              </Text>
              {selected ? <CheckIcon className="size-5 text-foreground" /> : null}
            </Pressable>
          );
        })}
        {workspaces.isLoading ? (
          <View className="py-4">
            <ContentState.Loading title={t('remoteAgent.loading')} />
          </View>
        ) : null}
        {workspaces.isError ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void workspaces.refetch(),
            }}
          />
        ) : null}
        {workspaces.hasNextPage ? (
          <Button
            variant="ghost"
            loading={workspaces.isFetchingNextPage}
            onPress={() => void workspaces.fetchNextPage()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
