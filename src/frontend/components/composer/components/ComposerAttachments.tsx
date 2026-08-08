import { Composer } from '@cherrystudio/ui/components';
import ExpoQuickLook from '@magrinj/expo-quick-look';
import { useCallback } from 'react';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerActions, useComposerState } from '../context/ComposerProvider';
import type { ComposerAttachmentDraft } from '../utils/composerAttachments';
import { ComposerAttachmentStrip } from './ComposerAttachmentStrip';

const logger = loggerService.withContext('ComposerAttachments');

/**
 * The staged attachments, in a row that swells and shrinks with them.
 *
 * `@cherrystudio/ui` used to ship a `Composer.Attachments`; it was removed once
 * both real callers needed a shape it did not have. This is that row, one layer
 * up, where knowing what an attachment *is* is allowed.
 */
export function ComposerAttachments() {
  const { attachments } = useComposerState();
  const { removeAttachment } = useComposerActions();

  const handleAttachmentPreview = useCallback((attachment: ComposerAttachmentDraft) => {
    void ExpoQuickLook.previewFile({
      editingMode: 'disabled',
      uri: attachment.uri,
    }).catch((error) => {
      logger.warn('Failed to preview attachment', error instanceof Error ? error : null);
    });
  }, []);

  return (
    <Composer.Collapsible style={attachmentRowStyle}>
      {attachments.length > 0 ? (
        <ComposerAttachmentStrip
          attachments={attachments}
          onAttachmentPreview={handleAttachmentPreview}
          onAttachmentRemove={removeAttachment}
        />
      ) : null}
    </Composer.Collapsible>
  );
}

// The tiles bleed to the surface's edge horizontally so the row reads as
// scrollable, but keep the composer's own rhythm above and below.
const attachmentRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
