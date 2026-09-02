import type { CreateAgentDto } from '@/shared/data/api/schemas/agents';
import {
  type Agent,
  DEFAULT_AGENT_TOOL_APPROVAL_MODE,
  type AgentToolApprovalMode,
} from '@/shared/data/types/agent';
import {
  type AgentCapability,
  DEFAULT_DISABLED_AGENT_CAPABILITIES,
} from '@/shared/data/types/agentCapability';
import type { UniqueModelId } from '@/shared/data/types/model';

export type AgentFormState = {
  /**
   * Draft avatar image URI. Seeded from the record's resolved `avatarUri`, so a
   * value that still equals the seed means "unchanged" and needs no file write.
   * Never part of the DTO: the avatar has its own endpoint.
   */
  avatarUri: string | null;
  /** Capability-group deny-list; a group absent from the list is enabled. */
  disabledCapabilities: AgentCapability[];
  instructions: string;
  modelId: UniqueModelId | null;
  name: string;
  toolApprovalMode: AgentToolApprovalMode;
};

type BuildAgentDtoOptions = {
  /** Omit modelId on create so AgentService resolves the current default model. */
  inheritDefaultModel?: boolean;
};

export function createAgentFormState(agent?: Agent): AgentFormState {
  return {
    avatarUri: agent?.avatarUri ?? null,
    // A new Agent starts with the sensitive device groups off; an existing
    // record keeps exactly what was saved.
    disabledCapabilities: agent
      ? [...agent.disabledCapabilities]
      : [...DEFAULT_DISABLED_AGENT_CAPABILITIES],
    instructions: agent?.instructions ?? '',
    modelId: agent?.modelId ?? null,
    name: agent?.name ?? '',
    toolApprovalMode: agent?.toolApprovalMode ?? DEFAULT_AGENT_TOOL_APPROVAL_MODE,
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
      disabledCapabilities: form.disabledCapabilities,
      instructions: form.instructions,
      ...(options.inheritDefaultModel ? {} : { modelId: form.modelId }),
      name,
      toolApprovalMode: form.toolApprovalMode,
    },
  };
}
