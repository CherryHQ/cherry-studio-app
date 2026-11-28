import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import ImagesIcon from '@cherrystudio/app-icons/icons/images';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { BottomSheet, Composer, useToast } from '@cherrystudio/ui/components';
import { useIsFocused } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type ViewInstance } from 'react-native';

import {
  useComposerDocumentPicker,
  useComposerMediaActions,
  useComposerMeta,
  useComposerPresentationActions,
} from '@/frontend/components/Composer';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { FilePickerBottomSheet } from './FilePickerBottomSheet';

const logger = loggerService.withContext('ChatToolsMenu');

type ActivePanel<TPanel extends string> = { kind: 'files' } | { kind: 'custom'; id: TPanel } | null;

export type ChatToolsMenuController<TPanel extends string> = {
  panel: TPanel | null;
  open: boolean;
  openPanel: (panel: TPanel) => void;
  closePanel: () => void;
  closeMenu: (afterClose?: () => void) => void;
  completeSelection: () => void;
  onPanelClosed: () => void;
};

/**
 * Shared `+` tools sheet shell with media tiles, library file picker, and
 * two-layer dismissal coordination for nested overlay panels.
 */
export function ChatToolsMenu<TPanel extends string = never>({
  allowCreateFolder = true,
  dismissToken,
  enabled,
  maxAttachments,
  media,
  mediaDisabled = false,
  onAfterClose,
  renderPanels,
  renderRows,
}: {
  allowCreateFolder?: boolean;
  dismissToken?: string;
  enabled: boolean;
  maxAttachments?: number;
  media: 'all' | 'images' | 'none';
  mediaDisabled?: boolean;
  onAfterClose?: () => void;
  renderPanels?: (controller: ChatToolsMenuController<TPanel>) => ReactNode;
  renderRows?: (controller: ChatToolsMenuController<TPanel>) => ReactNode;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const focused = useIsFocused();
  const { inputRef } = useComposerMeta();
  const { runInputReplacement } = useComposerPresentationActions();
  const { openCamera, openPhotoLibrary } = useComposerMediaActions();
  const openDocumentPicker = useComposerDocumentPicker();
  const [isOpen, setIsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel<TPanel>>(null);
  if (!enabled && isOpen) {
    setIsOpen(false);
    setActivePanel(null);
  }
  if (isOpen && activePanel?.kind === 'files' && media !== 'all') {
    setActivePanel(null);
  }
  const [shownDismissToken, setShownDismissToken] = useState(dismissToken);
  if (dismissToken !== shownDismissToken) {
    setShownDismissToken(dismissToken);
    if (dismissToken) {
      setIsOpen(false);
      setActivePanel(null);
    }
  }
  const pendingAction = useRef<(() => void) | undefined>(undefined);
  const triggerRef = useRef<ViewInstance>(null);
  const fileRef = useRef<ViewInstance>(null);
  const closingSurfaces = useRef(new Set<'menu' | 'panel'>());
  const closePanel = useCallback(() => setActivePanel(null), []);
  const openPanel = useCallback((id: TPanel) => setActivePanel({ kind: 'custom', id }), []);
  const closeMenu = useCallback(
    (afterClose?: () => void) => {
      if (closingSurfaces.current.size > 0) return;
      if (afterClose) pendingAction.current = afterClose;
      closingSurfaces.current = new Set(activePanel ? ['menu', 'panel'] : ['menu']);
      setIsOpen(false);
    },
    [activePanel],
  );
  const completeSelection = useCallback(() => {
    closeMenu(() => inputRef.current?.focus());
  }, [closeMenu, inputRef]);

  const surfaceClosed = useCallback(
    (surface: 'menu' | 'panel') => {
      // A preview only hides these sheets; a deliberate close waits for both exit motions.
      if (!closingSurfaces.current.delete(surface) || closingSurfaces.current.size > 0) return;
      setActivePanel(null);
      onAfterClose?.();
      const action = pendingAction.current;
      pendingAction.current = undefined;
      action?.();
    },
    [onAfterClose],
  );
  const onPanelClosed = useCallback(() => surfaceClosed('panel'), [surfaceClosed]);

  function openMedia(openPicker: () => Promise<void>) {
    closeMenu(() => {
      void openPicker().catch((error: unknown) => {
        logger.warn('Media picker failed', error instanceof Error ? error : { error });
        toast.show({ label: t('chat.filePicker.uploadFailed'), variant: 'danger' });
      });
    });
  }

  function openMenu() {
    const surfaces = closingSurfaces.current;
    if (surfaces.size > 0) return;
    void runInputReplacement(() => {
      // Ignore an opening queued before a newer close, even after that close finishes.
      if (closingSurfaces.current === surfaces) setIsOpen(true);
    });
  }

  const open = isOpen && focused && enabled;
  const panel = activePanel?.kind === 'custom' ? activePanel.id : null;
  const controller = useMemo<ChatToolsMenuController<TPanel>>(
    () => ({
      panel,
      open,
      openPanel,
      closePanel,
      closeMenu,
      completeSelection,
      onPanelClosed,
    }),
    [closeMenu, closePanel, completeSelection, onPanelClosed, open, openPanel, panel],
  );

  return (
    <>
      <View collapsable={false} ref={triggerRef}>
        <Composer.Action
          accessibilityLabel={t('chat.media.attach')}
          disabled={!enabled}
          onPress={openMenu}
          testID="composer-menu"
        >
          <PlusIcon className="size-4.5 text-foreground" />
        </Composer.Action>
      </View>
      <BottomSheet
        active={activePanel === null}
        onClose={() => closeMenu()}
        onClosed={() => surfaceClosed('menu')}
        open={open}
        presentation="overlay"
        returnFocusRef={triggerRef}
        size="content"
        title={t('chat.media.attach')}
        testID="chat-tools-sheet"
      >
        <View className="gap-5 px-6 pt-1 pb-3">
          {media !== 'none' ? (
            <View className="flex-row gap-3">
              <MediaTile
                disabled={mediaDisabled}
                icon={<CameraIcon className="size-6 text-foreground" />}
                label={t('chat.media.camera')}
                onPress={() => openMedia(openCamera)}
              />
              <MediaTile
                disabled={mediaDisabled}
                icon={<ImagesIcon className="size-6 text-foreground" />}
                label={t('chat.media.photos')}
                onPress={() => openMedia(openPhotoLibrary)}
              />
              {media === 'all' ? (
                <MediaTile
                  disabled={mediaDisabled}
                  icon={<FileTextIcon className="size-6 text-foreground" />}
                  label={t('chat.media.file')}
                  onPress={() => setActivePanel({ kind: 'files' })}
                  ref={fileRef}
                />
              ) : null}
            </View>
          ) : null}
          {renderRows ? (
            <ChatToolsMenuRowsSlot controller={controller} render={renderRows} />
          ) : null}
        </View>
      </BottomSheet>
      {activePanel?.kind === 'files' ? (
        <FilePickerBottomSheet
          allowCreateFolder={allowCreateFolder}
          maxAttachments={maxAttachments}
          onClose={closePanel}
          onClosed={() => surfaceClosed('panel')}
          onSelect={completeSelection}
          onUpload={() => openMedia(openDocumentPicker)}
          open={open}
          returnFocusRef={fileRef}
        />
      ) : null}
      {renderPanels ? (
        <ChatToolsMenuPanelsSlot controller={controller} render={renderPanels} />
      ) : null}
    </>
  );
}

function ChatToolsMenuRowsSlot<TPanel extends string>({
  controller,
  render,
}: {
  controller: ChatToolsMenuController<TPanel>;
  render: (controller: ChatToolsMenuController<TPanel>) => ReactNode;
}) {
  const rows = render(controller);
  return rows ? <View>{rows}</View> : null;
}

function ChatToolsMenuPanelsSlot<TPanel extends string>({
  controller,
  render,
}: {
  controller: ChatToolsMenuController<TPanel>;
  render: (controller: ChatToolsMenuController<TPanel>) => ReactNode;
}) {
  return render(controller);
}

function MediaTile({
  disabled = false,
  icon,
  label,
  onPress,
  ref,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  ref?: RefObject<ViewInstance | null>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-20 min-w-0 flex-1 items-center justify-center gap-3 rounded-2xl bg-secondary px-2 py-4 active:opacity-60 disabled:opacity-40"
      disabled={disabled}
      onPress={onPress}
      ref={ref}
    >
      {icon}
      <Text className="text-center text-sm text-foreground">{label}</Text>
    </Pressable>
  );
}

/** Shared row for the `+` tools sheet, supporting interactive navigation or read-only metadata. */
export function ChatToolsMenuRow({
  icon,
  label,
  onPress,
  ref,
  testID,
  value,
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  ref?: RefObject<ViewInstance | null>;
  testID?: string;
  value?: string;
}) {
  const content = (
    <>
      {icon}
      <Text className="min-w-0 flex-1 text-base text-foreground">{label}</Text>
      {value ? (
        <Text className="max-w-40 shrink text-sm text-muted-foreground" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <ChevronRightIcon className="size-4 text-muted-foreground" /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={value ? `${label}, ${value}` : label}
        className="min-h-14 flex-row items-center gap-3 rounded-xl py-2"
        ref={ref}
        testID={testID}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-14 flex-row items-center gap-3 rounded-xl py-2 active:opacity-60"
      onPress={onPress}
      ref={ref}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
