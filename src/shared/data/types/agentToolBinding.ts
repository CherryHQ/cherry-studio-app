import * as z from 'zod';

import { AgentIdSchema } from './agent';

export const AgentToolApprovalSchema = z.enum(['auto', 'ask', 'deny']);
export type AgentToolApproval = z.infer<typeof AgentToolApprovalSchema>;

export const AgentToolBindingSchema = z.strictObject({
  agentId: AgentIdSchema,
  approval: AgentToolApprovalSchema,
  createdAt: z.iso.datetime(),
  displayNameSnapshot: z.string().min(1).nullable(),
  enabled: z.boolean(),
  id: z.uuidv4(),
  rawToolName: z.string().min(1).optional(),
  serverId: z.uuidv4(),
  source: z.literal('mcp'),
  updatedAt: z.iso.datetime(),
});
export type AgentToolBinding = z.infer<typeof AgentToolBindingSchema>;

export const AgentMcpBindingAvailabilitySchema = z.enum([
  'available',
  'unbound',
  'binding-disabled',
  'server-unavailable',
  'tool-unavailable',
]);
export type AgentMcpBindingAvailability = z.infer<typeof AgentMcpBindingAvailabilitySchema>;

export const ResolvedAgentMcpToolBindingSchema = z.strictObject({
  approval: AgentToolApprovalSchema.nullable(),
  availability: AgentMcpBindingAvailabilitySchema,
  binding: AgentToolBindingSchema.nullable(),
  enabled: z.boolean(),
});
export type ResolvedAgentMcpToolBinding = z.infer<typeof ResolvedAgentMcpToolBindingSchema>;
