import { Composer } from '@cherrystudio/ui/components';
import type { PasteEventPayload } from 'expo-paste-input';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { useComposerActions, useComposerMeta } from '../context/ComposerProvider';
import { createPastedImageAttachmentDraft } from '../utils/composerAttachments';

/**
 * The text field, plus the two things the package's own `Composer.Input` cannot
 * decide for itself: what a pasted image means, and what a link means. Holds the
 * ref that `useComposerFieldDismiss` blurs and that the ＋ menu inserts through.
 */
export function ComposerField({ placeholder }: { placeholder?: string }) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();
  const { inputRef } = useComposerMeta();
  // `brand`, not `primary`: the product colour is a promise, while `primary` is
  // a slot the user may get to repaint.
  const brand = useThemeColor('brand');

  const handlePaste = useCallback(
    (payload: PasteEventPayload) => {
      if (payload.type === 'images' && payload.uris.length > 0) {
        addAttachments(payload.uris.map(createPastedImageAttachmentDraft));
      }
    },
    [addAttachments],
  );

  // A tool mention is the only link this field can contain — nothing here
  // creates any other kind, and auto-detection is off — so the base `link`
  // style is set alongside the variant rather than left to the library's blue.
  const markdownStyle = useMemo(() => {
    const mentionStyle = { color: brand, underline: false };

    return { link: mentionStyle, linkVariants: { '^tool:': mentionStyle } };
  }, [brand]);

  return (
    <Composer.Input
      markdownStyle={markdownStyle}
      onPaste={handlePaste}
      placeholder={placeholder ?? t('chat.inputPlaceholder')}
      ref={inputRef}
    />
  );
}
