import type { AgentMessageView } from '@/shared/contracts/agent';
import { SkillActivationSchema, type SkillActivation } from '@/shared/data/types/skill';

export type StoredSkillActivation = { messageId: string; activation: SkillActivation };

/** Only successful built-in load receipts and Host-written user selections count. */
export function collectSkillActivations(
  messages: readonly AgentMessageView[],
): StoredSkillActivation[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part): StoredSkillActivation[] => {
      if (message.role === 'user' && part.type === 'text') {
        return (part.skillSelections ?? []).map((activation) => ({
          messageId: message.id,
          activation,
        }));
      }
      if (
        message.role !== 'assistant' ||
        part.type !== 'tool' ||
        part.state !== 'output-available' ||
        part.toolRef.source !== 'builtin' ||
        part.toolRef.capabilityId !== 'load_skill'
      )
        return [];
      const output = part.output;
      const value =
        output && typeof output === 'object' && !Array.isArray(output) ? output.value : null;
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.status !== 'ok')
        return [];
      const receipt = SkillActivationSchema.safeParse(value.activation);
      return receipt.success ? [{ messageId: message.id, activation: receipt.data }] : [];
    }),
  );
}
