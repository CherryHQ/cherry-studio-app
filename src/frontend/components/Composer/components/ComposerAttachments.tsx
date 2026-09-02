import { Composer } from '@cherrystudio/ui/components';

import { useComposerActions, useComposerState } from '../context/ComposerProvider';
import { ComposerAttachmentStrip } from './ComposerAttachmentStrip';

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

  // A collapsed row keeps its last frame mounted while it animates out. File
  // previews can keep that native frame visible after the composer state has
  // already cleared, so the empty attachment row must leave the tree entirely.
  if (attachments.length === 0) return null;

  return (
    <Composer.Collapsible style={attachmentRowStyle}>
      <ComposerAttachmentStrip attachments={attachments} onAttachmentRemove={removeAttachment} />
    </Composer.Collapsible>
  );
}

// The tiles bleed to the surface's edge horizontally so the row reads as
// scrollable, but keep the composer's own rhythm above and below.
const attachmentRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
