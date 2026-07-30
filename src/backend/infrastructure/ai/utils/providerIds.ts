import * as z from 'zod';

const systemProviderIds = [
  'cherryin',
  'silicon',
  'aihubmix',
  'deepseek',
  'ppio',
  'dmxapi',
  'sophnet',
  'openrouter',
  'ollama',
  'new-api',
  'anthropic',
  'openai',
  'gemini',
  'zhipu',
  'dashscope',
  'doubao',
  'groq',
  'together',
  'nvidia',
  'grok',
  'mistral',
  'perplexity',
  'hunyuan',
  'tencent-cloud-ti',
  'poe',
  'huggingface',
  'gateway',
  'cerebras',
] as const;

export const SystemProviderIdSchema = z.enum(systemProviderIds);
export type SystemProviderId = z.infer<typeof SystemProviderIdSchema>;

export const isSystemProviderId = (id: string): id is SystemProviderId =>
  SystemProviderIdSchema.safeParse(id).success;

export const SystemProviderIds = Object.fromEntries(
  systemProviderIds.map((id) => [id, id]),
) as Record<SystemProviderId, SystemProviderId>;

export type ReasoningEffortOption =
  | 'default'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'auto';

export const EFFORT_RATIO: Record<ReasoningEffortOption, number> = {
  default: 0,
  none: 0.01,
  minimal: 0.05,
  low: 0.05,
  medium: 0.5,
  high: 0.8,
  xhigh: 0.9,
  auto: 2,
};
