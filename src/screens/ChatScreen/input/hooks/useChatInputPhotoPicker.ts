import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';

import type { InlinePhotoPickerAsset } from '@/modules/inlinePhotoPicker';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import {
  createImagePickerAttachmentDraft,
  createInlinePhotoPickerAttachmentDraft,
} from '@/screens/ChatScreen/input/utils/chatInputAttachments';

type ChatInputPhotoPickerState = {
  inlinePhotoPickerResetKey: number;
  isInlinePhotoPickerDisabled: boolean;
};

type ChatInputPhotoPickerActions = {
  addInlinePhotoPickerAssets: (assets: InlinePhotoPickerAsset[]) => void;
  launchCamera: () => Promise<void>;
  resetInlinePhotoPickerSelection: () => void;
};

export function useChatInputPhotoPicker(
  _isOpen: boolean,
  onAttachmentsAdd: (attachments: ChatInputAttachmentDraft[]) => void,
) {
  const [inlinePhotoPickerResetKey, setInlinePhotoPickerResetKey] = useState(0);
  const resetInlinePhotoPickerSelection = useCallback(() => {
    setInlinePhotoPickerResetKey((current) => current + 1);
  }, []);

  const launchCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled) {
      onAttachmentsAdd(result.assets.map(createImagePickerAttachmentDraft));
    }
  }, [onAttachmentsAdd]);

  const addInlinePhotoPickerAssets = useCallback(
    (assets: InlinePhotoPickerAsset[]) => {
      if (assets.length === 0) {
        return;
      }

      onAttachmentsAdd(assets.map(createInlinePhotoPickerAttachmentDraft));
      resetInlinePhotoPickerSelection();
    },
    [onAttachmentsAdd, resetInlinePhotoPickerSelection],
  );

  const state: ChatInputPhotoPickerState = useMemo(
    () => ({
      inlinePhotoPickerResetKey,
      isInlinePhotoPickerDisabled: false,
    }),
    [inlinePhotoPickerResetKey],
  );

  const actions: ChatInputPhotoPickerActions = useMemo(
    () => ({
      addInlinePhotoPickerAssets,
      launchCamera,
      resetInlinePhotoPickerSelection,
    }),
    [addInlinePhotoPickerAssets, launchCamera, resetInlinePhotoPickerSelection],
  );

  return {
    actions,
    state,
  };
}
