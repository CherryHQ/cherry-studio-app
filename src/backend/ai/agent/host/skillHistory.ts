import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';
import type { SkillActivation } from '@/shared/data/types/skill';

import type { StoredSkillActivation } from '../sessionStore/skillActivations';
import { SKILL_TOOL_NAMES } from '../tools/skill';
import type { SkillTurnScope } from './skillScope';

/** Most recent receipt per Skill; retry excludes the answer it is replacing. */
export function latestSkillActivations(
  receipts: readonly StoredSkillActivation[],
  excludeMessageId?: string,
): SkillActivation[] {
  const byId = new Map<string, SkillActivation>();
  for (const { messageId, activation } of receipts) {
    if (messageId !== excludeMessageId) {
      byId.delete(activation.skillId);
      byId.set(activation.skillId, activation);
    }
  }
  return [...byId.values()];
}

export function isSkillActivationCurrent(
  activation: SkillActivation,
  scope: SkillTurnScope,
): boolean {
  return scope.entries.some(
    (entry) =>
      entry.id === activation.skillId &&
      entry.packageDigest === activation.packageDigest &&
      (activation.origin === 'automatic'
        ? entry.invocation.modelInvocable
        : entry.invocation.userInvocable),
  );
}

/** Historical instructions and resource bodies are receipts, never current policy. */
export function stripSkillHistoryParts(parts: readonly AgentMessagePart[]): AgentMessagePart[] {
  return parts.map((part) =>
    part.type === 'tool' &&
    part.toolRef.source === 'builtin' &&
    SKILL_TOOL_NAMES.includes(part.toolRef.capabilityId) &&
    part.state === 'output-available'
      ? {
          ...part,
          output: {
            value: {
              status: 'historical',
              message:
                'Historical Skill activity. Use only the current Skills catalog and active instructions; reload resources when needed.',
            },
            artifacts: [],
          },
        }
      : part,
  );
}

export function stripSkillHistory(messages: readonly AgentMessageView[]): AgentMessageView[] {
  return messages.map((message) => ({ ...message, parts: stripSkillHistoryParts(message.parts) }));
}
