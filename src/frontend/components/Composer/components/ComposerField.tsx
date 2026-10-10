import { Composer, type ComposerInputProps } from '@cherrystudio/ui/components';
import type { PasteEventPayload } from 'expo-paste-input';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniwind } from 'uniwind';

import skillInlineIcon from '@/assets/skills/inline-icon.json';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getPluginMentionLinkStyles } from '@/frontend/utils/pluginIcons';

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
type ComposerFieldProps = Pick<
  ComposerInputProps,
  'onBlur' | 'onFocus' | 'placeholder' | 'style' | 'testID'
> & { attachmentMode?: 'images' | 'text-only' };

export function ComposerField({
  onBlur,
  onFocus,
  placeholder,
  style,
  testID,
  attachmentMode = 'images',
}: ComposerFieldProps) {
  const { t } = useTranslation();
  const { addAttachments } = useComposerActions();
  const { inputRef } = useComposerMeta();
  const { activateInput } = useComposerPresentationActions();
  const linkColor = useThemeColor('link');
  const { theme } = useUniwind();

  const handlePaste = useCallback(
    (payload: PasteEventPayload) => {
      if (attachmentMode === 'images' && payload.type === 'images' && payload.uris.length > 0) {
        addAttachments(payload.uris.map(createPastedImageAttachmentDraft));
      }
    },
    [addAttachments, attachmentMode],
  );

  // A plugin or Skill mention is the only link this field can contain — nothing here
  // creates any other kind, and auto-detection is off — so the base `link`
  // style is set alongside the variant rather than left to the library's blue.
  const markdownStyle = useMemo(() => {
    const mentionStyle = { color: linkColor, underline: false };

    return {
      link: mentionStyle,
      linkVariants: {
        ...getPluginMentionLinkStyles(linkColor, theme),
        // The native editor needs raster bytes for an inline text attachment.
        // Menus and the sidebar use the same ToolCase shape as a Lucide SVG.
        '^skill://': { ...mentionStyle, icon: skillInlineIcon['tool-case'], iconTint: true },
      },
    };
  }, [linkColor, theme]);

  const handleFocus = useCallback<NonNullable<ComposerInputProps['onFocus']>>(() => {
    // Focus is the only event that is allowed to reconnect the dock after a
    // sheet or native picker has replaced the input context.
    activateInput();
    onFocus?.();
  }, [activateInput, onFocus]);

  return (
    <Composer.Input
      markdownStyle={markdownStyle}
      onBlur={onBlur}
      onFocus={handleFocus}
      onPaste={handlePaste}
      placeholder={placeholder ?? t('chat.inputPlaceholder')}
      ref={inputRef}
      style={style}
      testID={testID}
    />
  );
}
