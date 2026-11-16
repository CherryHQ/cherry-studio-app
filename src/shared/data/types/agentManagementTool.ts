import * as z from 'zod';

import { AgentIdSchema, AgentModeSchema, AgentSchema, DEFAULT_AGENT_MODE } from './agent';

export const AgentToolTargetSchema = z
  .string()
  .refine(
    (value) => value === 'current' || AgentIdSchema.safeParse(value).success,
    'Invalid Agent id',
  )
  .describe(
    'An exact id returned by agent_list/agent_get, or current for this conversation’s Agent.',
  );

/** Tool results expose configuration, never managed avatar paths or provider credentials. */
export const AgentToolRecordSchema = AgentSchema.pick({
  id: true,
  name: true,
  instructions: true,
  mode: true,
  model: true,
  modelName: true,
  toolApprovalMode: true,
  updatedAt: true,
})
  // Tool results saved before modes existed remain readable as standard Agents.
  .extend({
    mode: AgentModeSchema.default(DEFAULT_AGENT_MODE),
  })
  .strip();

/** Version checks and avatar receipts do not need the Agent's instructions or bindings. */
export const AgentToolSummarySchema = AgentToolRecordSchema.pick({
  id: true,
  name: true,
  updatedAt: true,
});

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
