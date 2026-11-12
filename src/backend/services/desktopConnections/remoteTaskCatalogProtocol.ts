import { remoteFailureSchema, remoteLimits } from '@cherrystudio/remote-protocol';
import { agentMethods } from '@cherrystudio/remote-protocol/agent';
import * as z from 'zod';

const sessionList = agentMethods['agent.sessions.list'];
const id = agentMethods['agent.sessions.get'].params.shape.sessionId;

// PR #24299 is not published in remote-protocol 0.7.0. Consume only its catalog fields.
export const taskCatalogMethods = {
  'agent.sessions.list': {
    ...sessionList,
    params: sessionList.params.extend({ taskId: id.optional() }),
  },
  'agent.tasks.list': {
    params: sessionList.params.omit({ workspaceId: true }),
    result: sessionList.result.extend({
      items: z.array(z.looseObject({ taskId: id, agentId: id })).max(remoteLimits.pageItems),
    }),
    errors: remoteFailureSchema,
  },
};
