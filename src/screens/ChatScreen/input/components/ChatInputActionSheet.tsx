import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import type { CameraCapturedPicture } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { GlassView } from 'expo-glass-effect';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassAvailable, sheetScrimColor } from '@/config/constants';
import { loggerService } from '@/core/logger/LoggerService';
import { ChatInputActionList } from '@/screens/ChatScreen/input/components/ChatInputActionList';
import { ChatInputInlineCamera } from '@/screens/ChatScreen/input/components/ChatInputInlineCamera';
import {
  ChatInputCameraTile,
  ChatInputFileTile,
  ChatInputMediaStrip,
  ChatInputPhotosTile,
} from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import { ChatInputPhotoGrid } from '@/screens/ChatScreen/input/components/ChatInputPhotoGrid';
import {
  useChatInputActions,
  useChatInputMedia,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import type { ChatInputActionId } from '@/screens/ChatScreen/input/utils/chatInputActions';
import {
  createCameraAttachmentDraft,
  createDocumentAttachmentDraft,
} from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  chatInputSubviewEntering,
  chatInputSubviewExiting,
} from '@/screens/ChatScreen/input/utils/chatInputMotion';

// Detent indices into the `detents` array built from `useWindowDimensions()`
// below: 0 is closed, 1 is the default open height (half the screen), and 2 is
// reachable only by the user dragging further up (never asserted
// programmatically) — mirrors the old '50%'/'100%' snap points.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

const logger = loggerService.withContext('ChatInputActionSheet');

/**
 * The "+" action sheet. A plain header (title + X close) sits above the media
 * strip and action list. The previous `ScreenStack` wrapper was removed because
 * nesting it inside the bottom sheet crashes on Android on present.
 */
export function ChatInputActionSheet() {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { addAttachments, closeActionSheet, selectAction } = useChatInputActions();
  const { isActionSheetOpen, selectedToolId } = useChatInputState();
  const { actions, state: mediaState } = useChatInputMedia();
  const { clearSelectedPhotos } = actions;
  const [isPhotoGridOpen, setIsPhotoGridOpen] = useState(false);
  const [isInlineCameraOpen, setIsInlineCameraOpen] = useState(false);
  // `sheetIndex` mostly mirrors `isActionSheetOpen`, except while the user has
  // dragged past `OPEN_INDEX` up to the full-height detent — adjusted during
  // render (not an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsActionSheetOpen, setPrevIsActionSheetOpen] = useState(isActionSheetOpen);
  if (isActionSheetOpen !== prevIsActionSheetOpen) {
    setPrevIsActionSheetOpen(isActionSheetOpen);
    setSheetIndex(isActionSheetOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  const handleClose = useCallback(() => {
    setIsPhotoGridOpen(false);
    setIsInlineCameraOpen(false);
    clearSelectedPhotos();
    closeActionSheet();
  }, [clearSelectedPhotos, closeActionSheet]);
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
  const handlePhotosPress = useCallback(() => {
    setIsPhotoGridOpen(true);
  }, []);
  // Tapping the "相机" tile opens the inline camera sub-view in-sheet
  // (mirrors the inline photo picker) instead of the full-screen system camera.
  const handleCameraPress = useCallback(() => {
    setIsInlineCameraOpen(true);
  }, []);
  const handleCameraBack = useCallback(() => {
    setIsInlineCameraOpen(false);
    setSheetIndex(OPEN_INDEX);
  }, []);
  const handleCameraCapture = useCallback(
    (photo: CameraCapturedPicture) => {
      addAttachments([createCameraAttachmentDraft({ uri: photo.uri })]);
      handleClose();
    },
    [addAttachments, handleClose],
  );
  const handleInlineBack = useCallback(() => {
    clearSelectedPhotos();
    setIsPhotoGridOpen(false);
    setSheetIndex(OPEN_INDEX);
  }, [clearSelectedPhotos]);

  return (
    <ModalBottomSheet
      detents={[0, windowHeight * 0.5, windowHeight]}
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      // Fires on every settle (drag or programmatic) — including once,
      // harmlessly, on initial mount — so it's the right replacement for the
      // old `onClose`, which also fired unconditionally whenever the sheet
      // finished closing regardless of cause.
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          handleClose();
        }
      }}
      scrimColor={sheetScrimColor}
      surface={
        isLiquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            style={[StyleSheet.absoluteFill, styles.surfaceGlass]}
          />
        ) : (
          <View className="rounded-t-3xl bg-background" style={StyleSheet.absoluteFill} />
        )
      }
    >
      <View style={styles.sheetViewport}>
        {isInlineCameraOpen ? (
          // Wrapped in an Animated.View so the camera scales up from ~90% + fades
          // in on open and reverses on back (`transformOrigin: 'top'` so it grows
          // from the media-row buttons near the sheet top).
          <Animated.View
            entering={chatInputSubviewEntering}
            exiting={chatInputSubviewExiting}
            style={styles.subview}
            testID="chat-input-media-viewport"
          >
            <ChatInputInlineCamera
              bottomInset={insets.bottom}
              isActive={isInlineCameraOpen && isActionSheetOpen}
              onBack={handleCameraBack}
              onCapture={handleCameraCapture}
              onError={(message) => {
                logger.warn(`inline camera error: ${message}`);
              }}
              // Unlike the old @expo/ui SwiftUI-hosted sheet, this sheet
              // doesn't add its own bottom safe-area padding to content, so
              // the negative-margin workaround this used to need is gone. The
              // floating control bar still applies the inset as padding so
              // its buttons stay above the home indicator.
            />
          </Animated.View>
        ) : isPhotoGridOpen ? (
          <Animated.View
            entering={chatInputSubviewEntering}
            exiting={chatInputSubviewExiting}
            style={styles.subview}
            testID="chat-input-media-viewport"
          >
            <ChatInputPhotoGrid
              actions={actions}
              bottomInset={insets.bottom}
              onBack={handleInlineBack}
              onConfirm={handleClose}
              onError={(message) => {
                logger.warn(`photo grid error: ${message}`);
              }}
              state={mediaState}
            />
          </Animated.View>
        ) : (
          <View style={styles.stackHost}>
            <View className="flex-row items-center px-4 pt-4 pb-2">
              <Text
                className="flex-1 text-center font-semibold text-foreground text-lg"
                numberOfLines={1}
              >
                {t('chat.actionSheet.title')}
              </Text>
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
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
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
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
