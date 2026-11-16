import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';

import { useCameraAccess } from '@/frontend/hooks/useCameraAccess';

import { useComposerActions, useComposerPresentationActions } from '../context/ComposerProvider';
import {
  createCameraAttachmentDraft,
  createPhotoAttachmentDraft,
} from '../utils/composerAttachments';

/** Camera and photo-library handoffs shared by anchored menus and chat's bottom sheet. */
export function useComposerMediaActions() {
  const { addAttachments } = useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const requestCameraAccess = useCameraAccess();

  const openCamera = useCallback(async () => {
    await runInputReplacement(async () => {
      if (!(await requestCameraAccess())) {
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });

      if (result.canceled) {
        return;
      }

      addAttachments(result.assets.map((asset) => createCameraAttachmentDraft({ uri: asset.uri })));
    });
  }, [addAttachments, requestCameraAccess, runInputReplacement]);
  const openPhotoLibrary = useCallback(async () => {
    await runInputReplacement(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 1,
      });

      if (result.canceled) {
        return;
      }

      addAttachments(
        result.assets.map((asset) => {
          const attachment = createPhotoAttachmentDraft({
            fileName: asset.fileName ?? undefined,
            id: asset.assetId ?? asset.uri,
            uri: asset.uri,
          });

          return {
            ...attachment,
            mediaType: asset.mimeType ?? attachment.mediaType,
            size: asset.fileSize ?? attachment.size,
          };
        }),
      );
    });
  }, [addAttachments, runInputReplacement]);
  return { openCamera, openPhotoLibrary };
}
