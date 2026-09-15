import * as z from 'zod';

import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import { AgentToolBindingSchema } from '@/shared/data/types/agentToolBinding';

export const WriteAgentToolBindingSchema = z.strictObject({
  displayNameSnapshot: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
  // Third-party MCP cannot promote itself to auto approval through this API.
  approval: z.enum(['ask', 'deny']).default('ask'),
  rawToolName: z.string().min(1).optional(),
  serverId: z.uuidv4(),
  source: z.literal('mcp'),
});

export type WriteAgentToolBindingInput = z.input<typeof WriteAgentToolBindingSchema>;
export type WriteAgentToolBinding = z.output<typeof WriteAgentToolBindingSchema>;

export const ReplaceAgentToolBindingsSchema = z.strictObject({
  bindings: z.array(WriteAgentToolBindingSchema),
});
export type ReplaceAgentToolBindingsInput = z.input<typeof ReplaceAgentToolBindingsSchema>;
export type ReplaceAgentToolBindingsDto = z.output<typeof ReplaceAgentToolBindingsSchema>;

export const ListAgentToolBindingsResponseSchema = z.strictObject({
  items: z.array(AgentToolBindingSchema),
});

export const DeleteAgentToolBindingResultSchema = z.strictObject({ deleted: z.literal(true) });
export type DeleteAgentToolBindingResult = z.infer<typeof DeleteAgentToolBindingResultSchema>;

export type AgentToolBindingSchemas = {
  '/agents/:agentId/tool-bindings': {
    GET: {
      params: { agentId: string };
      response: { items: AgentToolBinding[] };
    };
    POST: {
      body: WriteAgentToolBindingInput;
      params: { agentId: string };
      response: AgentToolBinding;
    };
    PUT: {
      body: ReplaceAgentToolBindingsInput;
      params: { agentId: string };
      response: { items: AgentToolBinding[] };
    };
  };
  '/agents/:agentId/tool-bindings/:bindingId': {
    DELETE: {
      params: { agentId: string; bindingId: string };
      response: DeleteAgentToolBindingResult;
    };
  };
};
