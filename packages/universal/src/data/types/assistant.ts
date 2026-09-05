import { ReasoningEffortOptionSchema } from '@shared/types/aiSdk';
import * as z from 'zod';

import { UniqueModelIdSchema } from './model';

export const McpModeSchema = z.enum(['disabled', 'auto', 'manual']);
export type McpMode = z.infer<typeof McpModeSchema>;

export const AssistantSettingsSchema = z.looseObject({
  customParameters: z.array(
    z.discriminatedUnion('type', [
      z.object({ name: z.string(), type: z.literal('string'), value: z.string() }),
      z.object({ name: z.string(), type: z.literal('number'), value: z.number() }),
      z.object({ name: z.string(), type: z.literal('boolean'), value: z.boolean() }),
      z.object({ name: z.string(), type: z.literal('json'), value: z.unknown() }),
    ]),
  ),
  enableMaxTokens: z.boolean(),
  enableMaxToolCalls: z.boolean(),
  enableTemperature: z.boolean(),
  enableTopP: z.boolean(),
  enableWebSearch: z.boolean(),
  maxTokens: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  mcpMode: McpModeSchema,
  reasoning_effort: ReasoningEffortOptionSchema,
  streamOutput: z.boolean(),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
});
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>;

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  customParameters: [],
  enableMaxTokens: false,
  enableMaxToolCalls: true,
  enableTemperature: false,
  enableTopP: false,
  enableWebSearch: false,
  maxTokens: 4096,
  maxToolCalls: 20,
  mcpMode: 'auto',
  reasoning_effort: 'default',
  streamOutput: true,
  temperature: 1,
  topP: 1,
};

export const AssistantIdSchema = z.uuidv4();

export const AssistantSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  description: z.string(),
  emoji: z.emoji(),
  id: AssistantIdSchema,
  mcpServerIds: z.array(z.string()),
  modelId: UniqueModelIdSchema.nullable(),
  modelName: z.string().nullable(),
  name: z.string().min(1),
  orderKey: z.string(),
  prompt: z.string(),
  settings: AssistantSettingsSchema,
  updatedAt: z.iso.datetime(),
});
export type Assistant = z.infer<typeof AssistantSchema>;
