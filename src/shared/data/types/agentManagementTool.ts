import * as z from 'zod';

import { AgentModeSchema, AgentSchema, DEFAULT_AGENT_MODE } from './agent';

/** Tool results expose configuration, never managed avatar paths or provider credentials. */
export const AgentToolRecordSchema = AgentSchema.pick({
  id: true,
  name: true,
  instructions: true,
  mode: true,
  model: true,
  modelName: true,
  disabledCapabilities: true,
  toolApprovalMode: true,
  updatedAt: true,
})
  // Tool results saved before modes existed remain readable as standard Agents.
  .extend({ mode: AgentModeSchema.default(DEFAULT_AGENT_MODE) })
  .strip();

export const AgentMutationToolResultSchema = z.strictObject({
  status: z.enum(['created', 'updated']),
  // Historical tool outputs remain immutable when the Agent record fields change.
  agent: z.union([
    AgentToolRecordSchema,
    AgentToolRecordSchema.omit({ model: true })
      .extend({ modelId: AgentSchema.shape.model })
      .transform(({ modelId, ...agent }) => ({ ...agent, model: modelId })),
  ]),
});
