import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import { XIcon } from 'lucide-uniwind/png';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PhotoFile } from 'react-native-vision-camera';
import { loggerService } from '@/core/logger/loggerService';
import { type InlinePhotoPickerAsset, InlinePhotoPickerView } from '@/modules/inlinePhotoPicker';
import { ChatInputActionList } from '@/screens/ChatScreen/input/components/ChatInputActionList';
import { ChatInputInlineCamera } from '@/screens/ChatScreen/input/components/ChatInputInlineCamera';
import {
  ChatInputCameraTile,
  ChatInputFileTile,
  ChatInputMediaStrip,
  ChatInputPhotosTile,
} from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import {
  useChatInputActions,
  useChatInputMedia,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import type { ChatInputActionId } from '@/screens/ChatScreen/input/utils/chatInputActions';
import {
  createCameraAttachmentDraft,
  createDocumentAttachmentDraft,
  createInlinePhotoAttachmentDraft,
} from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  chatInputSubviewEntering,
  chatInputSubviewExiting,
} from '@/screens/ChatScreen/input/utils/chatInputMotion';

// The sheet opens at 50% and stays there for both the action list and the inline
// photo picker (the picker no longer auto-expands to 100%); 100% is kept as a
// snap point only so the user can still drag it up. Fixed values (no dynamic
// sizing) so the sheet doesn't resize from content measurement — that resize is
// what makes the embedded native header jump. Module-level for a stable array
// identity.
const SHEET_SNAP_POINTS = ['50%', '100%'];

// How long to let the sheet collapse before presenting the full-screen system
// library — ChatGPT-style "collapse the inline grid, then expand the full
// picker". Tuned to the sheet's dismiss animation so the picker slides up right
// as the sheet finishes, with no chat visible in between.
const INLINE_COLLAPSE_DURATION_MS = 300;

const logger = loggerService.withContext('ChatInputActionSheet');

/**
 * The "+" action sheet. A plain header (title + X close) sits above the media
 * strip and action list. The previous `ScreenStack` wrapper was removed because
 * nesting it inside the bottom sheet crashes on Android on present.
 */
export function ChatInputActionSheet() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { addAttachments, closeActionSheet, selectAction } = useChatInputActions();
  const { isActionSheetOpen, selectedToolId } = useChatInputState();
  const { actions } = useChatInputMedia();
  const { launchImageLibrary } = actions;
  const [isInlinePickerOpen, setIsInlinePickerOpen] = useState(false);
  const [isInlineCameraOpen, setIsInlineCameraOpen] = useState(false);
  // Latest selection from the native picker, captured so the native confirm
  // button can commit it without round-tripping each asset back down as a prop.
  const latestAssetsRef = useRef<InlinePhotoPickerAsset[]>([]);

  const handleClose = useCallback(() => {
    setIsInlinePickerOpen(false);
    setIsInlineCameraOpen(false);
    latestAssetsRef.current = [];
    closeActionSheet();
  }, [closeActionSheet]);
  const handleAddFilePress = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });

    if (result.canceled) {
      return;
    }

    addAttachments(result.assets.map(createDocumentAttachmentDraft));
    closeActionSheet();
  }, [addAttachments, closeActionSheet]);
  const handleActionPress = useCallback(
    (actionId: ChatInputActionId) => {
      selectAction(actionId);
      closeActionSheet();
    },
    [closeActionSheet, selectAction],
  );
  // Tapping the "图片" tile: iOS shows the native inline photo picker in-sheet;
  // Android has no such native module, so hand off to the system gallery via
  // expo-image-picker instead.
  const handlePhotosPress = useCallback(() => {
    if (Platform.OS !== 'ios') {
      handleClose();
      void launchImageLibrary();
      return;
    }

    setIsInlinePickerOpen(true);
  }, [handleClose, launchImageLibrary]);
  // Tapping the "相机" tile opens the inline VisionCamera sub-view in-sheet
  // (mirrors the inline photo picker) instead of the full-screen system camera.
  const handleCameraPress = useCallback(() => {
    setIsInlineCameraOpen(true);
  }, []);
  const handleCameraBack = useCallback(() => {
    setIsInlineCameraOpen(false);
  }, []);
  const handleCameraCapture = useCallback(
    (photo: PhotoFile) => {
      addAttachments([createCameraAttachmentDraft({ filePath: photo.filePath })]);
      handleClose();
    },
    [addAttachments, handleClose],
  );
  const handleInlineBack = useCallback(() => {
    setIsInlinePickerOpen(false);
    latestAssetsRef.current = [];
  }, []);
  const handleAllPhotosPress = useCallback(() => {
    // ChatGPT-style hand-off: collapse the inline grid first, then present the
    // full-screen system library. The sheet must be gone before we launch —
    // expo-image-picker presents from the top-most view controller, so launching
    // while the sheet is still up would nest the picker inside it (and tear it
    // down when the sheet closes). The delay covers the sheet's collapse so the
    // picker slides up right as it finishes, and the user lands back on the chat
    // afterwards instead of the inline picker.
    handleClose();
    setTimeout(() => {
      void launchImageLibrary();
    }, INLINE_COLLAPSE_DURATION_MS);
  }, [handleClose, launchImageLibrary]);
  const handleInlineConfirm = useCallback(() => {
    const assets = latestAssetsRef.current;

    if (assets.length > 0) {
      addAttachments(assets.map(createInlinePhotoAttachmentDraft));
    }

    handleClose();
  }, [addAttachments, handleClose]);

  return (
    <BottomSheet
      enableDynamicSizing={false}
      enablePanDownToClose
      handleComponent={null}
      index={isActionSheetOpen ? 0 : -1}
      onClose={handleClose}
      snapPoints={SHEET_SNAP_POINTS}
    >
      <BottomSheetView style={styles.sheetViewport}>
        {isInlineCameraOpen ? (
          // Wrapped in an Animated.View so the camera scales up from ~90% + fades
          // in on open and reverses on back (`transformOrigin: 'top'` so it grows
          // from the media-row buttons near the sheet top).
          <Animated.View
            entering={chatInputSubviewEntering}
            exiting={chatInputSubviewExiting}
            style={styles.subview}
          >
            <ChatInputInlineCamera
              isActive={isInlineCameraOpen && isActionSheetOpen}
              onBack={handleCameraBack}
              onCapture={handleCameraCapture}
              onError={(message) => {
                logger.warn(`inline camera error: ${message}`);
              }}
              // The @expo/ui sheet hosts this inside a SwiftUI view that respects
              // the bottom safe area, leaving a blank strip over the home
              // indicator. A negative bottom margin pulls the preview down to fill
              // it edge-to-edge; the floating control bar re-applies the inset as
              // padding so its buttons stay above the home indicator.
              style={{ marginBottom: -insets.bottom }}
            />
          </Animated.View>
        ) : isInlinePickerOpen ? (
          // Rendered without the header wrapper: the inline picker needs the full
          // sheet area, and react-native-screens' Screen would inset its content
          // by the safe area (leaving top/bottom gaps). Its back/confirm controls
          // are drawn natively, so no header is needed here. The Animated.View
          // gives it the same scale-up/fade as the camera.
          <Animated.View
            entering={chatInputSubviewEntering}
            exiting={chatInputSubviewExiting}
            style={styles.subview}
          >
            <InlinePhotoPickerView
              allPhotosLabel={t('chat.media.allPhotos')}
              backAccessibilityLabel={t('common.back')}
              confirmLabelTemplate={t('chat.media.addPhotosTemplate')}
              onAllPhotosPress={handleAllPhotosPress}
              onBackPress={handleInlineBack}
              onConfirm={handleInlineConfirm}
              onError={(event) => {
                logger.warn(`inline picker error: ${event.nativeEvent.message}`);
              }}
              onSelectionChange={(event) => {
                latestAssetsRef.current = event.nativeEvent.assets;
              }}
              selectionLimit={9}
              // The @expo/ui sheet hosts this inside a SwiftUI view that respects
              // the bottom safe area, leaving a blank strip over the home
              // indicator. A negative bottom margin pulls the native picker down
              // to fill it edge-to-edge. The negative top margin absorbs
              // PHPicker's own ~10pt top content inset so the grid sits flush
              // against the sheet top (the overflow is clipped by the sheet card's
              // rounded mask).
              style={[styles.inlinePicker, { marginBottom: -insets.bottom, marginTop: -16 }]}
            />
          </Animated.View>
        ) : (
          <View style={styles.stackHost}>
            <View className="flex-row items-center px-4 pt-4 pb-2">
              <Pressable
                accessibilityLabel={t('common.close')}
                accessibilityRole="button"
                className="size-8 items-center justify-center rounded-full active:opacity-70"
                hitSlop={6}
                onPress={handleClose}
              >
                <XIcon className="size-6 text-foreground" strokeWidth={2} />
              </Pressable>
              <Text className="flex-1 text-center font-semibold text-foreground text-lg" numberOfLines={1}>
                {t('chat.actionSheet.title')}
              </Text>
              <View className="size-8" />
            </View>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              style={styles.scrollViewport}
            >
              <ChatInputMediaStrip>
                <ChatInputCameraTile onPress={handleCameraPress} />
                <ChatInputPhotosTile onPress={handlePhotosPress} />
                <ChatInputFileTile onPress={handleAddFilePress} />
              </ChatInputMediaStrip>
              <View className="h-px bg-border" />
              <ChatInputActionList
                selectedActionId={selectedToolId}
                onActionPress={handleActionPress}
              />
            </ScrollView>
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  inlinePicker: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scrollViewport: {
    flex: 1,
    minHeight: 0,
  },
  sheetViewport: {
    flex: 1,
  },
  stackHost: {
    flex: 1,
  },
  // Wrapper for the inline camera / photo picker. `transformOrigin: 'top'` makes
  // the entering/exiting scale grow from the top of the sheet (where the media
  // row buttons sit) instead of the center.
  subview: {
    flex: 1,
    transformOrigin: 'top',
  },
});
