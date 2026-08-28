import { Composer, type ComposerInputProps } from '@cherrystudio/ui/components';
import type { PasteEventPayload } from 'expo-paste-input';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import {
  useComposerActions,
  useComposerMeta,
  useComposerPresentationActions,
} from '../context/ComposerProvider';
import { createPastedImageAttachmentDraft } from '../utils/composerAttachments';

/**
 * The text field, plus the two things the package's own `Composer.Input` cannot
 * decide for itself: what a pasted image means, and what a link means. Holds the
 * ref that input-replacing surfaces blur and that the ＋ menu inserts through.
 */
type ComposerFieldProps = Pick<ComposerInputProps, 'onBlur' | 'onFocus' | 'placeholder' | 'style'>;

export function ComposerField({ onBlur, onFocus, placeholder, style }: ComposerFieldProps) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();
  const { inputRef } = useComposerMeta();
  const { resumeKeyboardTracking } = useComposerPresentationActions();
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

  const handleFocus = useCallback<NonNullable<ComposerInputProps['onFocus']>>(() => {
    // Focus is the only event that is allowed to reconnect the dock after a
    // sheet or native picker has replaced the input context.
    resumeKeyboardTracking();
    onFocus?.();
  }, [onFocus, resumeKeyboardTracking]);

  return (
    <Composer.Input
      markdownStyle={markdownStyle}
      onBlur={onBlur}
      onFocus={handleFocus}
      onPaste={handlePaste}
      placeholder={placeholder ?? t('chat.inputPlaceholder')}
      ref={inputRef}
      style={style}
    />
  );
}
