import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import TerminalIcon from '@cherrystudio/app-icons/icons/terminal';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { Image } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ViewInstance } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { type FileWorkspaceAddress, useFileWorkspace } from '@/frontend/hooks/file';
import { useMcpIcon } from '@/frontend/hooks/mcp/useMcpIcon';

import { FileWorkspaceSheet } from '../../FileWorkspaceSheet';
import type { ChatInputMcpPrompt } from '../utils/chatInputMcpPrompts';
import type { ChatInputPlugin } from '../utils/chatInputPlugins';
import { ChatInputPluginSheet } from './ChatInputPluginSheet';
import { ChatInputPromptSheet } from './ChatInputPromptSheet';
import { ChatInputSkillSheet } from './ChatInputSkillSheet';
import { ChatInputSshSheet } from './ChatInputSsh';
import { ChatToolsMenu, ChatToolsMenuRow } from './ChatToolsMenu';

type ToolPanel = 'workspace' | 'plugins' | 'skills' | 'prompts' | 'ssh';

/** The tool menu stays mounted beneath its independently dismissible child sheet. */
export function ChatInputMenu({
  agentId,
  enabled,
  media,
  onPickSsh,
  plugins,
  prompts,
  skillAgentId,
  sshContextId,
}: {
  agentId?: string;
  enabled: boolean;
  media: 'all' | 'images';
  onPickSsh?: () => void;
  plugins?: readonly ChatInputPlugin[];
  prompts: readonly ChatInputMcpPrompt[];
  skillAgentId?: string;
  sshContextId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const target = route.status === 'ready' ? route.target : undefined;
  const workspace = useFileWorkspace({
    sessionId: target?.kind === 'session' ? target.sessionId : undefined,
    workspaceDraftId: target?.kind === 'draft' ? target.workspaceDraftId : undefined,
  });
  const mcpIcon = useMcpIcon();
  const [workspaceAddress, setWorkspaceAddress] = useState<FileWorkspaceAddress>();
  if (!enabled && workspaceAddress) {
    setWorkspaceAddress(undefined);
  }
  const selectionHandoff = target?.selectionHandoff;
  const [shownSelectionHandoff, setShownSelectionHandoff] = useState(selectionHandoff);
  // Returning a file reference from its preview goes straight to the composer.
  if (selectionHandoff !== shownSelectionHandoff) {
    setShownSelectionHandoff(selectionHandoff);
    if (selectionHandoff) {
      setWorkspaceAddress(undefined);
    }
  }
  const workspaceRef = useRef<ViewInstance>(null);
  const pluginRef = useRef<ViewInstance>(null);
  const skillRef = useRef<ViewInstance>(null);
  const promptRef = useRef<ViewInstance>(null);
  const sshRef = useRef<ViewInstance>(null);

  function openWorkspace(openPanel: (panel: ToolPanel) => void) {
    if (!target) return;
    if (target.kind === 'session') {
      setWorkspaceAddress({ sessionId: target.sessionId });
    } else {
      const workspaceDraftId = target.workspaceDraftId ?? uuidv7();
      if (!target.workspaceDraftId)
        router.setParams(chatRouteParams({ ...target, workspaceDraftId }));
      setWorkspaceAddress({ workspaceDraftId });
    }
    openPanel('workspace');
  }

  return (
    <ChatToolsMenu<ToolPanel>
      dismissToken={selectionHandoff}
      enabled={enabled}
      media={media}
      onAfterClose={() => setWorkspaceAddress(undefined)}
      renderRows={(menu) => (
        <>
          {target ? (
            <ChatToolsMenuRow
              icon={<FolderIcon className="size-5 text-muted-foreground" />}
              label={t('library.folders.title')}
              value={workspace.workspace?.name ?? t('workspace.none')}
              onPress={() => openWorkspace(menu.openPanel)}
              ref={workspaceRef}
              testID="chat-file-workspace"
            />
          ) : null}
          {plugins ? (
            <ChatToolsMenuRow
              icon={<BoxesIcon className="size-5 text-muted-foreground" />}
              label={t('plugins.title')}
              onPress={() => menu.openPanel('plugins')}
              ref={pluginRef}
              testID="chat-composer-plugins"
            />
          ) : null}
          {skillAgentId ? (
            <ChatToolsMenuRow
              icon={<ToolCaseIcon className="size-5 text-muted-foreground" />}
              label={t('skills.title')}
              onPress={() => menu.openPanel('skills')}
              ref={skillRef}
              testID="chat-composer-skills"
            />
          ) : null}
          {prompts.length > 0 ? (
            <ChatToolsMenuRow
              icon={<Image className="size-5" contentFit="contain" source={mcpIcon} />}
              label={t('plugins.mcp.title')}
              onPress={() => menu.openPanel('prompts')}
              ref={promptRef}
              testID="chat-composer-prompts"
            />
          ) : null}
          {onPickSsh ? (
            <ChatToolsMenuRow
              icon={<TerminalIcon className="size-5 text-muted-foreground" />}
              label={t('ssh.title')}
              onPress={() => {
                onPickSsh();
                menu.openPanel('ssh');
              }}
              ref={sshRef}
              testID="chat-composer-ssh"
            />
          ) : null}
        </>
      )}
      renderPanels={(menu) => (
        <>
          {menu.panel === 'workspace' && workspaceAddress ? (
            <FileWorkspaceSheet
              address={workspaceAddress}
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onOpenPreview={() => menu.closeMenu()}
              open={menu.open}
              returnFocusRef={workspaceRef}
            />
          ) : null}
          {menu.panel === 'plugins' && plugins ? (
            <ChatInputPluginSheet
              plugins={plugins}
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onSelect={menu.completeSelection}
              onConnect={() => menu.closeMenu(() => router.push('/plugins'))}
              open={menu.open}
              returnFocusRef={pluginRef}
            />
          ) : null}
          {menu.panel === 'skills' && skillAgentId ? (
            <ChatInputSkillSheet
              agentId={skillAgentId}
              onAdd={() =>
                menu.closeMenu(() =>
                  router.push({
                    pathname: '/skills',
                    params:
                      target?.kind === 'session'
                        ? { sessionId: target.sessionId }
                        : { agentId: skillAgentId },
                  }),
                )
              }
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onSelect={menu.completeSelection}
              open={menu.open}
              returnFocusRef={skillRef}
            />
          ) : null}
          {menu.panel === 'prompts' ? (
            <ChatInputPromptSheet
              agentId={agentId}
              prompts={prompts}
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onSelect={menu.completeSelection}
              open={menu.open}
              returnFocusRef={promptRef}
            />
          ) : null}
          {menu.panel === 'ssh' ? (
            <ChatInputSshSheet
              contextId={sshContextId}
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onSelect={menu.completeSelection}
              open={menu.open}
              returnFocusRef={sshRef}
            />
          ) : null}
        </>
      )}
    />
  );
}
