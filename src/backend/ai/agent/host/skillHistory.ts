import type { SkillActivation } from '@/shared/data/types/skill';

import type { StoredSkillActivation } from '../sessionStore/skillActivations';
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

/** An activation stays current while its Skill remains usable under the same invocation policy. */
export function isSkillActivationCurrent(
  activation: SkillActivation,
  scope: SkillTurnScope,
): boolean {
  return scope.entries.some(
    (entry) =>
      entry.id === activation.skillId &&
      (activation.origin === 'automatic'
        ? entry.invocation.modelInvocable
        : entry.invocation.userInvocable),
  );
}
