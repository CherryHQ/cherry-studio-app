import { useCallback } from 'react';

import { useFileUploadPicker } from '@/frontend/hooks/file';

import { useComposerActions, useComposerPresentationActions } from '../context/ComposerProvider';
import { createDocumentAttachmentDraft } from '../utils/composerAttachments';

/**
 * Composer adapter over the shared file-upload picker. It owns the input
 * replacement and stages chosen files as attachments; the shared picker owns
 * the native selection contract.
 */
export function useComposerDocumentPicker() {
  const { addAttachments } = useComposerActions();
  const { runInputReplacement } = useComposerPresentationActions();
  const pickFiles = useFileUploadPicker();

  return useCallback(async () => {
    await runInputReplacement(async () => {
      const files = await pickFiles();

      if (files.length > 0) {
        addAttachments(files.map(createDocumentAttachmentDraft));
      }
    });
  }, [addAttachments, pickFiles, runInputReplacement]);
}
