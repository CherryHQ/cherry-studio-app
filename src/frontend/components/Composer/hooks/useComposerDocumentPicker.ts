import * as DocumentPicker from 'expo-document-picker';
import { useCallback } from 'react';

import { useComposerActions, useComposerPresentationActions } from '../context/ComposerProvider';
import { createDocumentAttachmentDraft } from '../utils/composerAttachments';

/**
 * System document upload shared by the menu and the chat library picker. The
 * chosen files are staged in the composer at once and uploaded to the library
 * from there; see `createDocumentAttachmentDraft` for their ownership.
 */
export function useComposerDocumentPicker() {
  const { addAttachments } = useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();

  return useCallback(async () => {
    await runInputReplacement(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
      });

      if (!result.canceled) {
        addAttachments(result.assets.map(createDocumentAttachmentDraft));
      }
    });
  }, [addAttachments, runInputReplacement]);
}
