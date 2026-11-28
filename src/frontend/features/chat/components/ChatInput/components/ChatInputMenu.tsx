import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import TerminalIcon from '@cherrystudio/app-icons/icons/terminal';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { Image } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type RefObject, useRef, useState } from 'react';
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
import { usePluginCatalog, usePluginConnections } from '@/frontend/hooks/plugin';

import { FileWorkspaceSheet } from '../../FileWorkspaceSheet';
import { useChatInputMcpPrompts } from '../hooks/useChatInputMcpPrompts';
import { getConnectedChatInputPlugins } from '../utils/chatInputPlugins';
import { ChatInputPluginSheet } from './ChatInputPluginSheet';
import { ChatInputPromptSheet } from './ChatInputPromptSheet';
import { ChatInputSkillSheet } from './ChatInputSkillSheet';
import { ChatInputSshSheet } from './ChatInputSsh';
import { ChatToolsMenu, ChatToolsMenuRow } from './ChatToolsMenu';

type ToolPanel = 'workspace' | 'plugins' | 'skills' | 'prompts' | 'ssh';
type ReadyChatTarget = Extract<ReturnType<typeof parseChatRoute>, { status: 'ready' }>['target'];

/** The tool menu stays mounted beneath its independently dismissible child sheet. */
export function ChatInputMenu({
  agentId,
  enabled,
  media,
  onPickSsh,
  promptAgentId,
  showPlugins = false,
  skillAgentId,
  sshContextId,
}: {
  agentId?: string;
  enabled: boolean;
  media: 'all' | 'images';
  onPickSsh?: () => void;
  promptAgentId?: string;
  showPlugins?: boolean;
  skillAgentId?: string;
  sshContextId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const target = route.status === 'ready' ? route.target : undefined;
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
            <ChatInputWorkspaceRow
              onPress={() => openWorkspace(menu.openPanel)}
              rowRef={workspaceRef}
              target={target}
            />
          ) : null}
          {showPlugins ? (
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
          {promptAgentId ? (
            <ChatInputMcpPromptRow
              onPress={() => menu.openPanel('prompts')}
              promptAgentId={promptAgentId}
              rowRef={promptRef}
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
          {menu.panel === 'plugins' && showPlugins ? (
            <ChatInputPluginPanel
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
          {menu.panel === 'prompts' && promptAgentId ? (
            <ChatInputPromptPanel
              agentId={agentId}
              onClose={menu.closePanel}
              onClosed={menu.onPanelClosed}
              onSelect={menu.completeSelection}
              open={menu.open}
              promptAgentId={promptAgentId}
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

function ChatInputWorkspaceRow({
  onPress,
  rowRef,
  target,
}: {
  onPress: () => void;
  rowRef: RefObject<ViewInstance | null>;
  target: ReadyChatTarget;
}) {
  const { t } = useTranslation();
  const workspace = useFileWorkspace({
    sessionId: target.kind === 'session' ? target.sessionId : undefined,
    workspaceDraftId: target.kind === 'draft' ? target.workspaceDraftId : undefined,
  });

  return (
    <ChatToolsMenuRow
      icon={<FolderIcon className="size-5 text-muted-foreground" />}
      label={t('library.folders.title')}
      value={workspace.workspace?.name ?? t('workspace.none')}
      onPress={onPress}
      ref={rowRef}
      testID="chat-file-workspace"
    />
  );
}

function ChatInputMcpPromptRow({
  onPress,
  promptAgentId,
  rowRef,
}: {
  onPress: () => void;
  promptAgentId: string;
  rowRef: RefObject<ViewInstance | null>;
}) {
  const { t } = useTranslation();
  const mcpIcon = useMcpIcon();
  const prompts = useChatInputMcpPrompts(promptAgentId);

  if (prompts.length === 0) return null;

  return (
    <ChatToolsMenuRow
      icon={<Image className="size-5" contentFit="contain" source={mcpIcon} />}
      label={t('plugins.mcp.title')}
      onPress={onPress}
      ref={rowRef}
      testID="chat-composer-prompts"
    />
  );
}

function ChatInputPluginPanel({
  onClose,
  onClosed,
  onConnect,
  onSelect,
  open,
  returnFocusRef,
}: {
  onClose: () => void;
  onClosed: () => void;
  onConnect: () => void;
  onSelect: () => void;
  open: boolean;
  returnFocusRef: RefObject<ViewInstance | null>;
}) {
  const pluginCatalog = usePluginCatalog();
  const pluginConnections = usePluginConnections();
  const connectedPlugins =
    pluginCatalog.isError || pluginConnections.isError
      ? []
      : getConnectedChatInputPlugins(pluginCatalog.data, pluginConnections.data);

  return (
    <ChatInputPluginSheet
      plugins={connectedPlugins}
      onClose={onClose}
      onClosed={onClosed}
      onSelect={onSelect}
      onConnect={onConnect}
      open={open}
      returnFocusRef={returnFocusRef}
    />
  );
}

function ChatInputPromptPanel({
  agentId,
  onClose,
  onClosed,
  onSelect,
  open,
  promptAgentId,
  returnFocusRef,
}: {
  agentId?: string;
  onClose: () => void;
  onClosed: () => void;
  onSelect: () => void;
  open: boolean;
  promptAgentId: string;
  returnFocusRef: RefObject<ViewInstance | null>;
}) {
  const prompts = useChatInputMcpPrompts(promptAgentId);

  return (
    <ChatInputPromptSheet
      agentId={agentId}
      prompts={prompts}
      onClose={onClose}
      onClosed={onClosed}
      onSelect={onSelect}
      open={open}
      returnFocusRef={returnFocusRef}
    />
  );
}
