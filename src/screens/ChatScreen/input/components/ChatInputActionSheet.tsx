import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  InlinePhotoPickerErrorEvent,
  InlinePhotoPickerSelectionChangeEvent,
} from '@/modules/inlinePhotoPicker';
import { InlinePhotoPickerView } from '@/modules/inlinePhotoPicker';
import { ChatInputActionList } from '@/screens/ChatScreen/input/components/ChatInputActionList';
import { ChatInputActionSheetHeader } from '@/screens/ChatScreen/input/components/ChatInputActionSheetHeader';
import {
  ChatInputCameraTile,
  ChatInputMediaStrip,
} from '@/screens/ChatScreen/input/components/ChatInputMediaStrip';
import { ChatInputReasoningSheetPage } from '@/screens/ChatScreen/input/components/ChatInputReasoningSheetPage';
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
  const { addInlinePhotoPickerAssets, launchCamera, resetInlinePhotoPickerSelection } = actions;
  const { inlinePhotoPickerResetKey, isInlinePhotoPickerDisabled } = state;
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
      resetInlinePhotoPickerSelection();

      if (actionId === 'add-file') {
        void handleAddFilePress();
        return;
      }

      selectAction(actionId);
      closeActionSheet();
    },
    [closeActionSheet, handleAddFilePress, resetInlinePhotoPickerSelection, selectAction],
  );
  const handleReasoningEffortChange = useCallback(
    (nextReasoningEffort: Parameters<typeof selectReasoningEffort>[0]) => {
      selectReasoningEffort(nextReasoningEffort);
      setSheetPage('main');
    },
    [selectReasoningEffort],
  );
  const handleReasoningPress = useCallback(() => {
    resetInlinePhotoPickerSelection();
    setSheetPage('reasoning');
  }, [resetInlinePhotoPickerSelection]);
  const handleReasoningBack = useCallback(() => {
    setSheetPage('main');
  }, []);
  const handleInlinePhotoPickerSelection = useCallback(
    (event: InlinePhotoPickerSelectionChangeEvent) => {
      addInlinePhotoPickerAssets(event.nativeEvent.assets);
    },
    [addInlinePhotoPickerAssets],
  );
  const handleInlinePhotoPickerError = useCallback((_event: InlinePhotoPickerErrorEvent) => {
    // The native picker already keeps the sheet usable after an export failure.
  }, []);

  const handleClose = useCallback(() => {
    if (!isActionSheetOpen) {
      setSheetPage('main');
      return;
    }

    resetInlinePhotoPickerSelection();
    setSheetPage('main');
    closeActionSheet();
  }, [closeActionSheet, isActionSheetOpen, resetInlinePhotoPickerSelection]);

  return (
    <BottomSheet enablePanDownToClose index={isActionSheetOpen ? 0 : -1} onClose={handleClose}>
      <BottomSheetView style={styles.sheetViewport}>
        {sheetPage === 'main' ? (
          <View className="gap-4 px-4 pt-2" style={styles.sheetContent}>
            <View className="gap-3">
              <ChatInputActionSheetHeader />
              <ChatInputMediaStrip>
                <ChatInputCameraTile onPress={launchCamera} />
              </ChatInputMediaStrip>
              <View style={styles.inlinePhotoPickerFrame}>
                <InlinePhotoPickerView
                  disabled={isInlinePhotoPickerDisabled}
                  resetKey={inlinePhotoPickerResetKey}
                  selectionLimit={0}
                  style={styles.inlinePhotoPicker}
                  onError={handleInlinePhotoPickerError}
                  onSelectionChange={handleInlinePhotoPickerSelection}
                />
              </View>
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
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingBottom: 28,
  },
  inlinePhotoPicker: {
    flex: 1,
  },
  inlinePhotoPickerFrame: {
    height: 360,
    overflow: 'hidden',
  },
  sheetViewport: {
    position: 'relative',
  },
});
