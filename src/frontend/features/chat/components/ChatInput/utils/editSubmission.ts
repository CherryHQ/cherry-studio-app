import { AgentProtocolError } from '@/shared/contracts/agent';
import type { AgentEditUserMessageInput } from '@/shared/contracts/agent';
import type { AgentMode } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

import type { useChatInputReasoningEfforts } from '../hooks/useChatInputReasoningEfforts';
import type { useChatInputReasoningEffortSelection } from '../hooks/useChatInputReasoningEffortSelection';
import { getChatInputReasoningEffortSnapshot } from './chatInputReasoning';
import { readSkillMentions } from './skillMentions';

/**
 * The composer submits an edit as the question's raw text — mention labels
 * stay inline because the host remaps them onto the stored parts — plus the
 * composer's live selections, which define the new answer or answers.
 */
export function buildEditUserMessageInput({
  sessionId,
  messageId,
  text,
  attachmentCount,
  mode,
  replyModels,
  selectedModelId,
  reasoningEfforts,
  reasoningSelection,
}: {
  sessionId: string | undefined;
  messageId: string;
  text: string;
  attachmentCount: number;
  mode: AgentMode;
  replyModels: readonly UniqueModelId[] | null;
  selectedModelId: UniqueModelId | null;
  reasoningEfforts: ReturnType<typeof useChatInputReasoningEfforts>;
  reasoningSelection: ReturnType<typeof useChatInputReasoningEffortSelection>;
}): Omit<AgentEditUserMessageInput, 'additionalReplies'> & {
  additionalModelIds?: readonly UniqueModelId[];
} {
  if (!sessionId || attachmentCount > 0) {
    // Editing targets an existing Session message and keeps its original
    // attachments; the menu and drop area are disabled while editing, so only
    // an in-flight import can land here. Reject loudly so the composer
    // restores the typed edit instead of clearing it.
    throw new AgentProtocolError({
      code: sessionId ? 'CAPABILITY_UNSUPPORTED' : 'SESSION_NOT_FOUND',
      message: sessionId
        ? 'Editing keeps the original message attachments.'
        : 'Editing requires an existing Session.',
    });
  }
  const { skills, skillAction } =
    mode === 'standard' ? readSkillMentions(text) : { skills: [], skillAction: undefined };
  const modelId = replyModels?.[0] ?? selectedModelId;
  const { isReasoningEffortSelected, reasoningEffort } = reasoningSelection;
  return {
    sessionId,
    messageId,
    text,
    ...(skills.length ? { skillIds: skills.map((skill) => skill.id) } : {}),
    ...(skillAction ? { skillAction } : {}),
    ...(modelId ? { modelId } : {}),
    ...(replyModels ? { additionalModelIds: replyModels.slice(1) } : {}),
    ...(reasoningEfforts.length > 0
      ? {
          reasoningEffort: getChatInputReasoningEffortSnapshot(
            reasoningEffort,
            isReasoningEffortSelected,
            reasoningEfforts,
          ),
        }
      : {}),
  };
}
