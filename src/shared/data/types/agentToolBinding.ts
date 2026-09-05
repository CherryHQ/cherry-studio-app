import * as z from 'zod';

import { AgentIdSchema } from './agent';

export const AgentToolApprovalSchema = z.enum(['auto', 'ask', 'deny']);
export type AgentToolApproval = z.infer<typeof AgentToolApprovalSchema>;

const AGENT_TOOL_BINDING_BASE = {
  agentId: AgentIdSchema,
  approval: AgentToolApprovalSchema,
  createdAt: z.iso.datetime(),
  displayNameSnapshot: z.string().min(1).nullable(),
  enabled: z.boolean(),
  id: z.uuidv4(),
  updatedAt: z.iso.datetime(),
} as const;

export const AgentToolBindingSchema = z.discriminatedUnion('source', [
  // Kept so existing databases remain readable. Built-in system capabilities are
  // no longer Agent configuration and the Host ignores this legacy variant.
  z.strictObject({
    ...AGENT_TOOL_BINDING_BASE,
    capabilityId: z.string().min(1),
    source: z.literal('builtin'),
  }),
  z.strictObject({
    ...AGENT_TOOL_BINDING_BASE,
    rawToolName: z.string().min(1).optional(),
    serverId: z.uuidv4(),
    source: z.literal('mcp'),
  }),
]);
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
