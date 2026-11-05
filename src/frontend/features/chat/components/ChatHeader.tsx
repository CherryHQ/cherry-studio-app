import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import FolderCheckIcon from '@cherrystudio/app-icons/icons/folder-check';
import { useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { MainHeader } from '@/frontend/appShell/header';
import { type ChatRouteParamsInput, parseChatRoute } from '@/frontend/appShell/navigation/chat';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import { useFileWorkspace } from '@/frontend/hooks/file';

import { FileWorkspaceSheet } from './FileWorkspaceSheet';

/** Chats without an Agent retain workspace access even though they have no composer. */
export function ChatHeader(props: ComponentProps<typeof MainHeader>) {
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const sessionId =
    route.status === 'ready' && route.target.kind === 'session'
      ? route.target.sessionId
      : undefined;
  const { data: session } = useAgentSession(sessionId);
  const { agent, isLoading } = useAgentApiById(session?.agentId);

  return sessionId && session && !isLoading && !agent ? (
    <ReadOnlyChatHeader {...props} key={sessionId} sessionId={sessionId} />
  ) : (
    <MainHeader {...props} />
  );
}

function ReadOnlyChatHeader({
  sessionId,
  ...props
}: ComponentProps<typeof MainHeader> & { sessionId: string }) {
  const { t } = useTranslation();
  const workspace = useFileWorkspace({ sessionId });
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <MainHeader
        {...props}
        actions={[
          {
            key: 'file-workspace',
            type: 'icon',
            icon: workspace.folderId ? FolderCheckIcon : FolderIcon,
            nativeIcon: workspace.folderId
              ? require('@/assets/header-toolbar/folder-check.png')
              : require('@/assets/header-toolbar/folder.png'),
            accessibilityLabel: workspace.workspace?.name
              ? t('workspace.openCurrent', { name: workspace.workspace.name })
              : t('workspace.open'),
            testID: 'chat-file-workspace',
            onPress: () => {
              Keyboard.dismiss();
              setOpen(true);
            },
          },
        ]}
      />
      <FileWorkspaceSheet
        address={{ sessionId }}
        onClose={close}
        onOpenPreview={close}
        open={open}
      />
    </>
  );
}
