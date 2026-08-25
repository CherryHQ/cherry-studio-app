import type { CreateAgentDto } from '@/shared/data/api/schemas/agents';
import type { Agent, AgentSettings } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

export type AgentReasoningEffort = NonNullable<AgentSettings['reasoningEffort']>;

export type AgentFormState = {
  description: string;
  enableMaxOutputTokens: boolean;
  enableReasoningEffort: boolean;
  enableTemperature: boolean;
  instructions: string;
  maxOutputTokens: string;
  modelId: UniqueModelId | null;
  name: string;
  reasoningEffort: AgentReasoningEffort;
  temperature: string;
};

export const AGENT_REASONING_EFFORTS: readonly AgentReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
];

const defaultTemperature = 1;
const defaultMaxOutputTokens = 4096;
const defaultReasoningEffort: AgentReasoningEffort = 'medium';

type BuildAgentDtoOptions = {
  /** Omit modelId on create so AgentService resolves the current default model. */
  inheritDefaultModel?: boolean;
};

export function createAgentFormState(agent?: Agent): AgentFormState {
  const settings = agent?.settings ?? {};

  return {
    description: agent?.description ?? '',
    enableMaxOutputTokens: settings.maxOutputTokens !== undefined,
    enableReasoningEffort: settings.reasoningEffort !== undefined,
    enableTemperature: settings.temperature !== undefined,
    instructions: agent?.instructions ?? '',
    maxOutputTokens: String(settings.maxOutputTokens ?? defaultMaxOutputTokens),
    modelId: agent?.modelId ?? null,
    name: agent?.name ?? '',
    reasoningEffort: settings.reasoningEffort ?? defaultReasoningEffort,
    temperature: String(settings.temperature ?? defaultTemperature),
  };
}

/**
 * Disabled settings are emitted as explicit-undefined keys, not omitted: the
 * update endpoint shallow-merges `settings`, and only a physically present
 * `key: undefined` clears a previously stored value. Unknown loose settings
 * keys are never touched because the patch carries only the three known keys.
 */
export function buildAgentDto(
  form: AgentFormState,
  options: BuildAgentDtoOptions = {},
): { ok: true; value: CreateAgentDto } | { errorKey: string; ok: false } {
  const name = form.name.trim();

  if (!name) {
    return { ok: false, errorKey: 'agent.form.nameRequired' };
  }

  let temperature: number | undefined;
  if (form.enableTemperature) {
    const temperatureText = form.temperature.trim();
    if (!temperatureText) {
      return { ok: false, errorKey: 'agent.form.temperatureInvalid' };
    }

    temperature = Number(temperatureText);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return { ok: false, errorKey: 'agent.form.temperatureInvalid' };
    }
  }

  let maxOutputTokens: number | undefined;
  if (form.enableMaxOutputTokens) {
    maxOutputTokens = Number(form.maxOutputTokens);
    if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) {
      return { ok: false, errorKey: 'agent.form.maxOutputTokensInvalid' };
    }
  }

  return {
    ok: true,
    value: {
      description: form.description.trim(),
      instructions: form.instructions,
      ...(options.inheritDefaultModel ? {} : { modelId: form.modelId }),
      name,
      settings: {
        maxOutputTokens,
        reasoningEffort: form.enableReasoningEffort ? form.reasoningEffort : undefined,
        temperature,
      },
    },
  };
}
