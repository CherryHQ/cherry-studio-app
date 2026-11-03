import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
} from '@/frontend/components/Composer/utils/composerAttachments';

type ComposerDraft = {
  attachments: readonly ComposerAttachmentDraft[];
  draft: string;
};

/** Append shared content without losing the draft or duplicating managed files. */
export function mergeComposerHandoff(
  current: ComposerDraft,
  incoming: ComposerDraft,
): ComposerDraft {
  return {
    draft: [current.draft, incoming.draft].filter(Boolean).join('\n'),
    attachments: appendComposerAttachments(current.attachments, incoming.attachments),
  };
}
