import type { CreateAgentDto } from '@/shared/data/api/schemas/agents';
import type { Agent } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

export type AgentFormState = {
  description: string;
  instructions: string;
  modelId: UniqueModelId | null;
  name: string;
};

type BuildAgentDtoOptions = {
  /** Omit modelId on create so AgentService resolves the current default model. */
  inheritDefaultModel?: boolean;
};

export function createAgentFormState(agent?: Agent): AgentFormState {
  return {
    description: agent?.description ?? '',
    instructions: agent?.instructions ?? '',
    modelId: agent?.modelId ?? null,
    name: agent?.name ?? '',
  };
}

export function buildAgentDto(
  form: AgentFormState,
  options: BuildAgentDtoOptions = {},
): { ok: true; value: CreateAgentDto } | { errorKey: string; ok: false } {
  const name = form.name.trim();

  if (!name) {
    return { ok: false, errorKey: 'agent.form.nameRequired' };
  }

  return {
    ok: true,
    value: {
      description: form.description.trim(),
      instructions: form.instructions,
      ...(options.inheritDefaultModel ? {} : { modelId: form.modelId }),
      name,
    },
  };
}
