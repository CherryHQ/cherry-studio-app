import * as z from 'zod';

import { AgentSchema } from './agent';

/** Tool results expose configuration, never managed avatar paths or provider credentials. */
export const AgentToolRecordSchema = AgentSchema.pick({
  id: true,
  name: true,
  instructions: true,
  modelId: true,
  modelName: true,
  disabledCapabilities: true,
  toolApprovalMode: true,
  updatedAt: true,
}).strip();

export const AgentMutationToolResultSchema = z.strictObject({
  status: z.enum(['created', 'updated']),
  agent: AgentToolRecordSchema,
});
