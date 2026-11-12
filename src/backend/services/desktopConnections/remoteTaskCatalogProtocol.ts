import { remoteFailureSchema, remoteLimits } from '@cherrystudio/remote-protocol';
import { agentMethods } from '@cherrystudio/remote-protocol/agent';
import * as z from 'zod';

const sessionList = agentMethods['agent.sessions.list'];
const id = agentMethods['agent.sessions.get'].params.shape.sessionId;
const name = agentMethods['agent.agents.list'].result.shape.items.element.shape.name;
const trigger = z.discriminatedUnion('kind', [
  z.looseObject({
    kind: z.literal('cron'),
    expr: name.min(1),
    timezone: z.string().max(256).optional(),
  }),
  z.looseObject({ kind: z.literal('interval'), ms: z.number().int().positive() }),
  z.looseObject({ kind: z.literal('once'), at: z.number().int().nonnegative() }),
]);

// PR #24299 is not published in remote-protocol 0.7.0. Consume only its catalog fields.
export const taskCatalogMethods = {
  'agent.sessions.list': {
    ...sessionList,
    params: sessionList.params.extend({ taskId: id.optional() }),
  },
  'agent.tasks.list': {
    params: sessionList.params.omit({ workspaceId: true }),
    result: sessionList.result.extend({
      items: z
        .array(z.looseObject({ taskId: id, agentId: id, name, trigger }))
        .max(remoteLimits.pageItems),
    }),
    errors: remoteFailureSchema,
  },
};
