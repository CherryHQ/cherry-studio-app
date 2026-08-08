import { Composer, useComposerMenu } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import * as DocumentPicker from 'expo-document-picker';
import { CameraIcon, CheckIcon, FileIcon, ImagesIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { getChatInputCameraPanelSize, getChatInputMenuRoom } from '../chatInputLayout';
import {
  type ChatInputMediaContextValue,
  useChatInputActions,
  useChatInputMedia,
  useChatInputState,
} from '../context/ChatInputProvider';
import { type ChatInputActionId, chatInputActions } from '../utils/chatInputActions';
import {
  createCameraAttachmentDraft,
  createDocumentAttachmentDraft,
} from '../utils/chatInputAttachments';
import { ChatInputCamera } from './ChatInputCamera';
import { ChatInputPhotoGrid } from './ChatInputPhotoGrid';

const logger = loggerService.withContext('ChatInputMenu');

type ChatInputMenuProps = {
  onActionPress?: (actionId: ChatInputActionId) => void;
};

/**
 * The ＋ menu. A first level of rows — camera, photos, files, then the tools —
 * and two further levels the panel grows into rather than navigating to.
 * `Composer.Menu` has no notion of levels; this is just different children under
 * items that do not close.
 */
export function ChatInputMenu({ onActionPress }: ChatInputMenuProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { addAttachments, selectAction, setMenuLevel } = useChatInputActions();
  const { menuLevel, selectedToolId } = useChatInputState();
  const media = useChatInputMedia();
  const room = getChatInputMenuRoom(window, insets);

  // Everything the panel needs is read here and handed down as props. The panel
  // is portalled, and this portal re-renders its children under the host rather
  // than teleporting the node — so a hook called inside it looks for providers
  // at the host, not at this call site, and finds none.
  const showRoot = useCallback(() => setMenuLevel('root'), [setMenuLevel]);
  const leavePhotos = useCallback(() => {
    media.actions.clearSelectedPhotos();
    setMenuLevel('root');
  }, [media.actions, setMenuLevel]);
  const addCameraPhoto = useCallback(
    (uri: string) => addAttachments([createCameraAttachmentDraft({ uri })]),
    [addAttachments],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      // The panel grows into the space the keyboard would occupy, so it takes
      // the keyboard down. The old sheet did the opposite — it left the field
      // as first responder so iOS restored the keyboard on dismiss — but that
      // only worked because the sheet covered half the screen and no more.
      if (isOpen) {
        void KeyboardController.dismiss();
      } else {
        setMenuLevel('root');
      }
    },
    [setMenuLevel],
  );
  const handleFilePress = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map(createDocumentAttachmentDraft));
  }, [addAttachments]);
  const handleActionPress = useCallback(
    (actionId: ChatInputActionId) => {
      if (onActionPress) {
        onActionPress(actionId);
        return;
      }

      selectAction(actionId);
    },
    [onActionPress, selectAction],
  );

  return (
    <Composer.Menu
      accessibilityLabel={t('chat.media.attach')}
      onOpenChange={handleOpenChange}
      testID="chat-input-menu"
    >
      {menuLevel === 'camera' ? (
        <ChatInputCameraLevel
          {...getChatInputCameraPanelSize(room)}
          onBack={showRoot}
          onCapture={addCameraPhoto}
        />
      ) : null}
      {menuLevel === 'photos' ? (
        <ChatInputPhotoLevel
          maxHeight={room.maxHeight}
          media={media}
          onBack={leavePhotos}
          width={room.maxWidth}
        />
      ) : null}
      {menuLevel === 'root' ? (
        <>
          <Composer.Menu.Item
            closeOnPress={false}
            icon={<CameraIcon className="size-5 text-foreground" strokeWidth={2} />}
            label={t('chat.media.camera')}
            onPress={() => setMenuLevel('camera')}
          />
          <Composer.Menu.Item
            closeOnPress={false}
            icon={<ImagesIcon className="size-5 text-foreground" strokeWidth={2} />}
            label={t('chat.media.photos')}
            onPress={() => setMenuLevel('photos')}
          />
          <Composer.Menu.Item
            icon={<FileIcon className="size-5 text-foreground" strokeWidth={2} />}
            label={t('chat.media.file')}
            onPress={() => {
              void handleFilePress();
            }}
          />
          <View className="my-1 h-px bg-border" />
          {chatInputActions.map((action) => {
            const Icon = action.icon;
            const isSelected = action.id === selectedToolId;

            return (
              <Composer.Menu.Item
                icon={
                  <Icon
                    className={cn('size-5', isSelected ? 'text-primary' : 'text-foreground')}
                    strokeWidth={2}
                  />
                }
                key={action.id}
                label={t(action.titleKey)}
                onPress={() => handleActionPress(action.id)}
                selected={isSelected}
                trailing={
                  isSelected ? (
                    <CheckIcon className="size-5 text-primary" strokeWidth={2.25} />
                  ) : null
                }
              />
            );
          })}
        </>
      ) : null}
    </Composer.Menu>
  );
}

/**
 * The photo grid, sized rather than flexed: it hangs off the bottom of a panel
 * that is measuring its content, so `flex-1` would resolve to nothing.
 */
function ChatInputPhotoLevel({
  maxHeight,
  media,
  onBack,
  width,
}: {
  maxHeight: number;
  media: ChatInputMediaContextValue;
  onBack: () => void;
  width: number;
}) {
  const { close } = useComposerMenu();

  return (
    <View style={{ height: maxHeight, width }}>
      <ChatInputPhotoGrid
        actions={media.actions}
        // The grid sits inside a rounded panel that already clears the home
        // indicator, so its floating controls need no safe-area inset of their
        // own — only enough air to look deliberate.
        bottomInset={0}
        onBack={onBack}
        onConfirm={close}
        onError={(message) => {
          logger.warn(`photo grid error: ${message}`);
        }}
        state={media.state}
        width={width}
      />
    </View>
  );
}

/** The viewfinder, sized for the same reason the photo grid is. */
function ChatInputCameraLevel({
  height,
  onBack,
  onCapture,
  width,
}: {
  height: number;
  onBack: () => void;
  onCapture: (uri: string) => void;
  width: number;
}) {
  const { close } = useComposerMenu();

  return (
    <View style={{ height, width }}>
      <ChatInputCamera
        bottomInset={0}
        isActive
        onBack={onBack}
        onCapture={(photo) => {
          onCapture(photo.uri);
          close();
        }}
        onError={(message) => {
          logger.warn(`camera error: ${message}`);
        }}
      />
    </View>
  );
}
