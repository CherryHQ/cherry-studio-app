import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatInputActionList } from '@/screens/ChatScreen/input/components/ChatInputActionList';
import { ChatInputActionSheetHeader } from '@/screens/ChatScreen/input/components/ChatInputActionSheetHeader';
import {
  ChatInputCameraTile,
  ChatInputMediaStrip,
  ChatInputPhotoPreviewTile,
  ChatInputPhotosTile,
} from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import { ChatInputSelectedPhotoBar } from '@/screens/ChatScreen/input/components/ChatInputSelectedPhotoBar';
import {
  useChatInputActions,
  useChatInputMedia,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import type { ChatInputActionId } from '@/screens/ChatScreen/input/utils/chatInputActions';

const chatInputActionSheetSnapPoints = ['50%', '70%'];

export function ChatInputActionSheet() {
  const { closeActionSheet, selectAction } = useChatInputActions();
  const { isActionSheetOpen, selectedToolId } = useChatInputState();
  const { actions, state } = useChatInputMedia();
  const {
    clearSelectedPhotos,
    launchCamera,
    launchImageLibrary,
    presentLimitedPhotoPermissionsPicker,
    togglePhotoSelection,
  } = actions;
  const {
    photoAccess,
    photoPreviews,
    selectedPhotoCount,
    selectedPhotoOrder,
    shouldShowPhotosTile,
  } = state;
  const handleActionPress = useCallback(
    (actionId: ChatInputActionId) => {
      clearSelectedPhotos();
      selectAction(actionId);
      closeActionSheet();
    },
    [clearSelectedPhotos, closeActionSheet, selectAction],
  );
  const handleSelectedPhotosAdd = useCallback(() => undefined, []);

  const handleClose = useCallback(() => {
    clearSelectedPhotos();
    closeActionSheet();
  }, [clearSelectedPhotos, closeActionSheet]);

  return (
    <BottomSheet
      enablePanDownToClose
      enableDynamicSizing={false}
      index={isActionSheetOpen ? 0 : -1}
      snapPoints={chatInputActionSheetSnapPoints}
      onClose={handleClose}
    >
      <BottomSheetView style={styles.sheetViewport}>
        <View className="gap-4 px-4 pt-2" style={styles.sheetContent}>
          <View className="gap-3">
            <ChatInputActionSheetHeader
              photoAccess={photoAccess}
              onAllPhotosPress={launchImageLibrary}
              onLimitedPhotoAccessPress={presentLimitedPhotoPermissionsPicker}
            />
            <ChatInputMediaStrip>
              <ChatInputCameraTile onPress={launchCamera} />
              {shouldShowPhotosTile ? <ChatInputPhotosTile onPress={launchImageLibrary} /> : null}
              {photoPreviews.map((photo) => (
                <ChatInputPhotoPreviewTile
                  key={photo.id}
                  selectionOrder={selectedPhotoOrder.get(photo.id)}
                  uri={photo.uri}
                  onPress={() => togglePhotoSelection(photo.id)}
                />
              ))}
            </ChatInputMediaStrip>
          </View>
          <View className="h-px bg-border" />
          <ChatInputActionList
            selectedActionId={selectedToolId}
            onActionPress={handleActionPress}
          />
        </View>
        <ChatInputSelectedPhotoBar
          selectedPhotoCount={selectedPhotoCount}
          onPress={handleSelectedPhotosAdd}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingBottom: 28,
  },
  sheetViewport: {
    flex: 1,
    position: 'relative',
  },
});
