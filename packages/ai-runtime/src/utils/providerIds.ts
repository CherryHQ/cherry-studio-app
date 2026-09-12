import * as z from 'zod';

const systemProviderIds = [
  'cherryin',
  'radeon-cloud',
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
