import type { CreateAgentDto } from '@/shared/data/api/schemas/agents';
import {
  type Agent,
  type AgentMode,
  DEFAULT_AGENT_MODE,
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
  mode: AgentMode;
  model: UniqueModelId | null;
  name: string;
  toolApprovalMode: AgentToolApprovalMode;
};

type BuildAgentDtoOptions = {
  /** Omit model on create so AgentService resolves the current default model. */
  inheritDefaultModel?: boolean;
};

export function createAgentFormState(agent?: Agent): AgentFormState {
  return {
    avatarUri: agent?.avatarUri ?? null,
    // A new Agent starts with the sensitive device groups and Agent management
    // off; an existing record keeps exactly what was saved.
    disabledCapabilities: agent
      ? [...agent.disabledCapabilities]
      : [...DEFAULT_DISABLED_AGENT_CAPABILITIES],
    instructions: agent?.instructions ?? '',
    mode: agent?.mode ?? DEFAULT_AGENT_MODE,
    model: agent?.model ?? null,
    name: agent?.name ?? '',
    toolApprovalMode: agent?.toolApprovalMode ?? DEFAULT_AGENT_TOOL_APPROVAL_MODE,
  };
}

export function setAgentCapabilityEnabled(
  disabledCapabilities: readonly AgentCapability[],
  capability: AgentCapability,
  enabled: boolean,
): AgentCapability[] {
  return enabled
    ? disabledCapabilities.filter((entry) => entry !== capability)
    : [...new Set([...disabledCapabilities, capability])];
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
      mode: form.mode,
      ...(options.inheritDefaultModel ? {} : { model: form.model }),
      name,
      toolApprovalMode: form.toolApprovalMode,
    },
  };
}
