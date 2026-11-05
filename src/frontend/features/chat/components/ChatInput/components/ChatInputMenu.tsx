import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { BottomSheet, Composer, Image, useToast } from '@cherrystudio/ui/components';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type ViewInstance } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import {
  useComposerDocumentPicker,
  useComposerMediaActions,
  useComposerMeta,
  useComposerPresentationActions,
} from '@/frontend/components/Composer';
import { type FileWorkspaceAddress, useFileWorkspace } from '@/frontend/hooks/file';
import { useMcpIcon } from '@/frontend/hooks/mcp/useMcpIcon';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { FileWorkspaceSheet } from '../../FileWorkspaceSheet';
import type { ChatInputMcpPrompt } from '../utils/chatInputMcpPrompts';
import type { ChatInputPlugin } from '../utils/chatInputPlugins';
import { ChatInputPluginSheet } from './ChatInputPluginSheet';
import { ChatInputPromptSheet } from './ChatInputPromptSheet';
import { ChatInputSkillSheet } from './ChatInputSkillSheet';
import { FilePickerBottomSheet } from './FilePickerBottomSheet';

const logger = loggerService.withContext('ChatInputMenu');
type ToolPanel = 'files' | 'workspace' | 'plugins' | 'skills' | 'prompts';

/** The tool menu stays mounted beneath its independently dismissible child sheet. */
export function ChatInputMenu({
  agentId,
  enabled,
  media,
  plugins,
  prompts,
  skillAgentId,
}: {
  agentId?: string;
  enabled: boolean;
  media: 'all' | 'images';
  plugins?: readonly ChatInputPlugin[];
  prompts: readonly ChatInputMcpPrompt[];
  skillAgentId?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const focused = useIsFocused();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const target = route.status === 'ready' ? route.target : undefined;
  const workspace = useFileWorkspace({
    sessionId: target?.kind === 'session' ? target.sessionId : undefined,
    workspaceDraftId: target?.kind === 'draft' ? target.workspaceDraftId : undefined,
  });
  const mcpIcon = useMcpIcon();
  const { inputRef } = useComposerMeta();
  const { runInputReplacement } = useComposerPresentationActions();
  const { openCamera, openPhotoLibrary } = useComposerMediaActions();
  const openDocumentPicker = useComposerDocumentPicker();
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<ToolPanel | null>(null);
  const [workspaceAddress, setWorkspaceAddress] = useState<FileWorkspaceAddress>();
  if (!enabled && isOpen) {
    setIsOpen(false);
    setPanel(null);
    setWorkspaceAddress(undefined);
  }
  const selectionHandoff = target?.selectionHandoff;
  const [shownSelectionHandoff, setShownSelectionHandoff] = useState(selectionHandoff);
  // Returning a file reference from its preview goes straight to the composer.
  if (selectionHandoff !== shownSelectionHandoff) {
    setShownSelectionHandoff(selectionHandoff);
    if (selectionHandoff) {
      setIsOpen(false);
      setPanel(null);
      setWorkspaceAddress(undefined);
    }
  }
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  const triggerRef = useRef<ViewInstance>(null);
  const fileRef = useRef<ViewInstance>(null);
  const workspaceRef = useRef<ViewInstance>(null);
  const pluginRef = useRef<ViewInstance>(null);
  const skillRef = useRef<ViewInstance>(null);
  const promptRef = useRef<ViewInstance>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const closingSurfaces = useRef(new Set<'menu' | 'panel'>());
  const closeMenu = useCallback(() => {
    if (closingSurfaces.current.size > 0) return;
    closingSurfaces.current = new Set(panel ? ['menu', 'panel'] : ['menu']);
    setIsOpen(false);
  }, [panel]);
  const completeSelection = useCallback(() => {
    pendingAction.current = () => inputRef.current?.focus();
    closeMenu();
  }, [closeMenu, inputRef]);
  function surfaceClosed(surface: 'menu' | 'panel') {
    // A preview only hides these sheets; a deliberate close waits for both exit motions.
    if (!closingSurfaces.current.delete(surface) || closingSurfaces.current.size > 0) return;
    setPanel(null);
    setWorkspaceAddress(undefined);
    const action = pendingAction.current;
    pendingAction.current = undefined;
    action?.();
  }

  function openMedia(open: () => Promise<void>) {
    pendingAction.current = () => {
      void open().catch((error: unknown) => {
        logger.warn('Media picker failed', error instanceof Error ? error : { error });
        toast.show({ label: t('chat.filePicker.uploadFailed'), variant: 'danger' });
      });
    };
    closeMenu();
  }

  function openMenu() {
    const surfaces = closingSurfaces.current;
    if (surfaces.size > 0) return;
    void runInputReplacement(() => {
      // Ignore an opening queued before a newer close, even after that close finishes.
      if (closingSurfaces.current === surfaces) setIsOpen(true);
    });
  }

  function openWorkspace() {
    if (!target) return;
    if (target.kind === 'session') {
      setWorkspaceAddress({ sessionId: target.sessionId });
    } else {
      const workspaceDraftId = target.workspaceDraftId ?? uuidv7();
      if (!target.workspaceDraftId)
        router.setParams(chatRouteParams({ ...target, workspaceDraftId }));
      setWorkspaceAddress({ workspaceDraftId });
    }
    setPanel('workspace');
  }

  const open = isOpen && focused && enabled;
  return (
    <>
      <View collapsable={false} ref={triggerRef}>
        <Composer.Action
          accessibilityLabel={t('chat.media.attach')}
          disabled={!enabled}
          onPress={openMenu}
          testID="composer-menu"
        >
          <PlusIcon className="size-5 text-foreground" />
        </Composer.Action>
      </View>
      <BottomSheet
        active={panel === null}
        onClose={closeMenu}
        onClosed={() => surfaceClosed('menu')}
        open={open}
        presentation="overlay"
        returnFocusRef={triggerRef}
        size="content"
        title={t('chat.media.attach')}
        testID="chat-tools-sheet"
      >
        <View className="gap-5 px-6 pt-1 pb-3">
          <View className="flex-row gap-3">
            <MediaTile
              icon={<CameraIcon className="size-6 text-foreground" />}
              label={t('chat.media.camera')}
              onPress={() => openMedia(openCamera)}
            />
            <MediaTile
              icon={<ImagesIcon className="size-6 text-foreground" />}
              label={t('chat.media.photos')}
              onPress={() => openMedia(openPhotoLibrary)}
            />
            {media === 'all' ? (
              <MediaTile
                icon={<FileTextIcon className="size-6 text-foreground" />}
                label={t('chat.media.file')}
                onPress={() => setPanel('files')}
                ref={fileRef}
              />
            ) : null}
          </View>
          <View>
            {target ? (
              <ToolRow
                icon={<FolderIcon className="size-5 text-muted-foreground" />}
                label={t('library.folders.title')}
                value={workspace.workspace?.name ?? t('workspace.none')}
                onPress={openWorkspace}
                ref={workspaceRef}
                testID="chat-file-workspace"
              />
            ) : null}
            {plugins ? (
              <ToolRow
                icon={<BoxesIcon className="size-5 text-muted-foreground" />}
                label={t('plugins.title')}
                onPress={() => setPanel('plugins')}
                ref={pluginRef}
                testID="chat-composer-plugins"
              />
            ) : null}
            {skillAgentId ? (
              <ToolRow
                icon={<ToolCaseIcon className="size-5 text-muted-foreground" />}
                label={t('skills.title')}
                onPress={() => setPanel('skills')}
                ref={skillRef}
                testID="chat-composer-skills"
              />
            ) : null}
            {prompts.length > 0 ? (
              <ToolRow
                icon={<Image className="size-5" contentFit="contain" source={mcpIcon} />}
                label={t('plugins.mcp.title')}
                onPress={() => setPanel('prompts')}
                ref={promptRef}
                testID="chat-composer-prompts"
              />
            ) : null}
          </View>
        </View>
      </BottomSheet>
      {panel === 'files' ? (
        <FilePickerBottomSheet
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onSelect={completeSelection}
          onUpload={() => openMedia(openDocumentPicker)}
          open={open}
          returnFocusRef={fileRef}
        />
      ) : null}
      {panel === 'workspace' && workspaceAddress ? (
        <FileWorkspaceSheet
          address={workspaceAddress}
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onOpenPreview={closeMenu}
          open={open}
          returnFocusRef={workspaceRef}
        />
      ) : null}
      {panel === 'plugins' && plugins ? (
        <ChatInputPluginSheet
          plugins={plugins}
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onSelect={completeSelection}
          onConnect={() => {
            pendingAction.current = () => router.push('/plugins');
            closeMenu();
          }}
          open={open}
          returnFocusRef={pluginRef}
        />
      ) : null}
      {panel === 'skills' && skillAgentId ? (
        <ChatInputSkillSheet
          agentId={skillAgentId}
          onAdd={() => {
            pendingAction.current = () =>
              router.push({
                pathname: '/skills',
                params:
                  target?.kind === 'session'
                    ? { sessionId: target.sessionId }
                    : { agentId: skillAgentId },
              });
            closeMenu();
          }}
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onSelect={completeSelection}
          open={open}
          returnFocusRef={skillRef}
        />
      ) : null}
      {panel === 'prompts' ? (
        <ChatInputPromptSheet
          agentId={agentId}
          prompts={prompts}
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onSelect={completeSelection}
          open={open}
          returnFocusRef={promptRef}
        />
      ) : null}
    </>
  );
}

function MediaTile({
  icon,
  label,
  onPress,
  ref,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  ref?: RefObject<ViewInstance | null>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-20 min-w-0 flex-1 items-center justify-center gap-3 rounded-2xl bg-secondary px-2 py-4 active:opacity-60"
      onPress={onPress}
      ref={ref}
    >
      {icon}
      <Text className="text-center text-sm text-foreground">{label}</Text>
    </Pressable>
  );
}

function ToolRow({
  icon,
  label,
  onPress,
  ref,
  testID,
  value,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  ref?: RefObject<ViewInstance | null>;
  testID: string;
  value?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-14 flex-row items-center gap-3 rounded-xl py-2 active:opacity-60"
      onPress={onPress}
      ref={ref}
      testID={testID}
    >
      {icon}
      <Text className="min-w-0 flex-1 text-base text-foreground">{label}</Text>
      {value ? (
        <Text className="max-w-32 shrink text-sm text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </Pressable>
  );
}
