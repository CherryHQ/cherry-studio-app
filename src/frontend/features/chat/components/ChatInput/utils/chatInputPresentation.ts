import {
  type ComposerAttachmentDraft,
  hasComposerSendableContent,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { AgentInputQueue } from '@/shared/contracts/agent';

export function getChatInputPresentation({
  attachments,
  draft,
  isBusy,
  steeringTarget,
}: {
  attachments: readonly ComposerAttachmentDraft[];
  draft: string;
  isBusy: boolean;
  steeringTarget?: string;
}) {
  const hasContent = hasComposerSendableContent(draft, attachments);

  return {
    sendAction: hasContent ? ('send' as const) : ('auto' as const),
    shouldShowSubmissionOptions: hasContent && (isBusy || steeringTarget !== undefined),
  };
}

export function shouldShowChatInputQueue(queue: AgentInputQueue): boolean {
  return queue.inputs.length > 0;
}
