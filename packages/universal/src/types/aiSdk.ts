import {
  objectValues,
  REASONING_EFFORT,
  type ReasoningEffort,
} from '@cherrystudio/provider-registry';
import * as z from 'zod';

export type ReasoningEffortOption = Exclude<ReasoningEffort, 'ultra'> | 'default';

export const ReasoningEffortOptionSchema = z.enum([
  'default',
  ...objectValues(REASONING_EFFORT).filter((effort) => effort !== 'ultra'),
]);

const AiSdkParamsSchema = z.enum([
  'maxOutputTokens',
  'temperature',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'stopSequences',
  'seed',
]);

export type AiSdkParam = z.infer<typeof AiSdkParamsSchema>;

export const isAiSdkParam = (param: string): param is AiSdkParam =>
  AiSdkParamsSchema.safeParse(param).success;
