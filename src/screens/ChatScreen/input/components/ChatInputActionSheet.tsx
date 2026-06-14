import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatInputActionList } from '@/screens/ChatScreen/input/components/ChatInputActionList';
import { ChatInputActionSheetHeader } from '@/screens/ChatScreen/input/components/ChatInputActionSheetHeader';
import {
  ChatInputCameraTile,
  ChatInputMediaStrip,
  ChatInputPhotoPreviewTile,
  ChatInputPhotosTile,
} from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import { ChatInputReasoningSheetPage } from '@/screens/ChatScreen/input/components/ChatInputReasoningSheetPage';
import { ChatInputSelectedPhotoBar } from '@/screens/ChatScreen/input/components/ChatInputSelectedPhotoBar';
import {
  useChatInputActions,
  useChatInputMedia,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import type { ChatInputActionId } from '@/screens/ChatScreen/input/utils/chatInputActions';
import { createDocumentAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

type ChatInputActionSheetPage = 'main' | 'reasoning';

export function ChatInputActionSheet() {
  const { addAttachments, closeActionSheet, selectAction, selectReasoningEffort } =
    useChatInputActions();
  const { isActionSheetOpen, reasoningEffort, selectedToolId } = useChatInputState();
  const [sheetPage, setSheetPage] = useState<ChatInputActionSheetPage>('main');
  const { actions, state } = useChatInputMedia();
  const {
    addSelectedPhotoPreviews,
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
      clearSelectedPhotos();

      if (actionId === 'add-file') {
        void handleAddFilePress();
        return;
      }

      selectAction(actionId);
      closeActionSheet();
    },
    [clearSelectedPhotos, closeActionSheet, handleAddFilePress, selectAction],
  );
  const handleReasoningEffortChange = useCallback(
    (nextReasoningEffort: Parameters<typeof selectReasoningEffort>[0]) => {
      selectReasoningEffort(nextReasoningEffort);
      setSheetPage('main');
    },
    [selectReasoningEffort],
  );
  const handleReasoningPress = useCallback(() => {
    clearSelectedPhotos();
    setSheetPage('reasoning');
  }, [clearSelectedPhotos]);
  const handleReasoningBack = useCallback(() => {
    setSheetPage('main');
  }, []);
  const handlePhotosPress = useCallback(() => {
    if (photoAccess === 'limited') {
      void presentLimitedPhotoPermissionsPicker();
      return;
    }

    void launchImageLibrary();
  }, [launchImageLibrary, photoAccess, presentLimitedPhotoPermissionsPicker]);
  const handleSelectedPhotosAdd = useCallback(() => {
    addSelectedPhotoPreviews();
    closeActionSheet();
  }, [addSelectedPhotoPreviews, closeActionSheet]);

  const handleClose = useCallback(() => {
    clearSelectedPhotos();
    setSheetPage('main');
    closeActionSheet();
  }, [clearSelectedPhotos, closeActionSheet]);

  return (
    <BottomSheet enablePanDownToClose index={isActionSheetOpen ? 0 : -1} onClose={handleClose}>
      <BottomSheetView style={styles.sheetViewport}>
        {sheetPage === 'main' ? (
          <View className="gap-4 px-4 pt-2" style={styles.sheetContent}>
            <View className="gap-3">
              <ChatInputActionSheetHeader
                photoAccess={photoAccess}
                onAllPhotosPress={launchImageLibrary}
                onLimitedPhotoAccessPress={presentLimitedPhotoPermissionsPicker}
              />
              <ChatInputMediaStrip>
                <ChatInputCameraTile onPress={launchCamera} />
                {shouldShowPhotosTile ? <ChatInputPhotosTile onPress={handlePhotosPress} /> : null}
                {photoPreviews.map((photo) => {
                  const selectionIndex = selectedPhotoOrder.get(photo.id);

                  return (
                    <ChatInputPhotoPreviewTile
                      isSelected={selectionIndex !== undefined}
                      key={photo.id}
                      selectionIndex={selectionIndex}
                      uri={photo.uri}
                      onPress={() => togglePhotoSelection(photo.id)}
                    />
                  );
                })}
              </ChatInputMediaStrip>
            </View>
            <View className="h-px bg-border" />
            <ChatInputActionList
              reasoningEffort={reasoningEffort}
              selectedActionId={selectedToolId}
              onActionPress={handleActionPress}
              onReasoningPress={handleReasoningPress}
            />
          </View>
        ) : (
          <ChatInputReasoningSheetPage
            reasoningEffort={reasoningEffort}
            onBack={handleReasoningBack}
            onReasoningEffortChange={handleReasoningEffortChange}
          />
        )}
        {sheetPage === 'main' ? (
          <ChatInputSelectedPhotoBar
            selectedPhotoCount={selectedPhotoCount}
            onPress={handleSelectedPhotosAdd}
          />
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingBottom: 28,
  },
  sheetViewport: {
    position: 'relative',
  },
});
