import { z } from 'zod';

export const AI_USAGE_PURPOSES = [
  'conversation-response',
  'context-compaction',
  'session-naming',
  'translation',
  'painting-generation',
  'image-response',
  'agent-image-tool',
  'model-check',
] as const;
export type AiUsagePurpose = (typeof AI_USAGE_PURPOSES)[number];
export const AiUsagePurposeSchema = z.enum(AI_USAGE_PURPOSES);
