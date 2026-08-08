import { Composer } from '@cherrystudio/ui/components';
import type { PasteEventPayload } from 'expo-paste-input';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useComposerActions, useComposerMeta } from '../context/ComposerProvider';
import { createPastedImageAttachmentDraft } from '../utils/composerAttachments';

/**
 * The text field, plus the one thing the package's own `Composer.Input` cannot
 * do: turn pasted images into attachments. Holds the ref that
 * `useComposerFieldDismiss` blurs.
 */
export function ComposerField({ placeholder }: { placeholder?: string }) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();
  const { inputRef } = useComposerMeta();

  const handlePaste = useCallback(
    (payload: PasteEventPayload) => {
      if (payload.type === 'images' && payload.uris.length > 0) {
        addAttachments(payload.uris.map(createPastedImageAttachmentDraft));
      }
    },
    [addAttachments],
  );

  return (
    <Composer.Input
      onPaste={handlePaste}
      placeholder={placeholder ?? t('chat.inputPlaceholder')}
      ref={inputRef}
    />
  );
}
