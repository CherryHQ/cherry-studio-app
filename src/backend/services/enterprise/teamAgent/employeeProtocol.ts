import * as z from 'zod';

import { TeamAgentError, type TeamChatView, type TeamMessage } from '@/shared/contracts/teamAgent';

const status = z.enum(['ready', 'preparing', 'stopped', 'failed']);
export const employeesSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    runtimeKind: z.string(),
    runtimeStatus: z.enum(['running', 'stopped', 'missing', 'unknown']),
    status,
    agents: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        description: z.string(),
        status,
        kind: z.enum(['main', 'assistant']),
        portraitId: z.number().nullable(),
      }),
    ),
  }),
);
export type Employee = z.infer<typeof employeesSchema>[number];
export const sessionSchema = z.object({
  id: z.uuid(),
  title: z.string().optional(),
  channel: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  created_at: z.string().optional(),
});
export type EmployeeSession = z.infer<typeof sessionSchema>;
export const runSchema = z.object({
  requestId: z.string().min(1).max(200),
  state: z.enum(['missing', 'unknown', 'running', 'done', 'cancelled', 'busy', 'failed']),
});
const tool = {
  type: z.literal('dynamic-tool'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
};
export const chatViewSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      createdAt: z.iso.datetime({ offset: true }).optional(),
      model: z.string().optional(),
      usage: z
        .object({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          totalTokens: z.number().optional(),
        })
        .optional(),
      timing: z
        .object({
          startedAt: z.iso.datetime({ offset: true }),
          completedAt: z.iso.datetime({ offset: true }).optional(),
        })
        .optional(),
      parts: z.array(
        z.union([
          z.object({
            type: z.enum(['text', 'reasoning']),
            text: z.string(),
            state: z.enum(['streaming', 'done']).optional(),
          }),
          // Keep supported content readable when a snapshot also contains unrendered parts.
          z.object({ type: z.enum(['step-start', 'data-image', 'data-file', 'data-artifact']) }),
          z.object({ ...tool, state: z.literal('input-available') }),
          z.object({ ...tool, state: z.literal('output-available'), output: z.unknown() }),
          z.object({ ...tool, state: z.literal('output-error'), errorText: z.string() }),
        ]),
      ),
    }),
  ),
  pending: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['approval', 'clarify']),
      text: z.string(),
      requestId: z.string(),
    }),
  ),
  run: runSchema.nullable(),
  canApprove: z.boolean(),
  idempotentSubmit: z.boolean(),
});
export const detailSchema = z.object({
  model: z.string(),
  skills: z.array(z.object({ name: z.string(), description: z.string(), disabled: z.boolean() })),
  mcp: z.array(z.object({ name: z.string(), enabled: z.boolean() })),
});
export type EmployeeView = z.infer<typeof chatViewSchema>;
export function employeeAgentId(employeeId: string, agentId: string) {
  return JSON.stringify([employeeId, agentId]);
}
export function employeeTarget(id: string) {
  try {
    const [employeeId, agentId] = z.tuple([z.uuid(), z.uuid()]).parse(JSON.parse(id));
    return { employeeId, agentId };
  } catch {
    throw new TeamAgentError('invalid-input');
  }
}
export const isReady = (employee: Employee, agentId: string) =>
  ['hermes', 'astra'].includes(employee.runtimeKind) &&
  employee.status === 'ready' &&
  employee.runtimeStatus === 'running' &&
  employee.agents.some((agent) => agent.id === agentId && agent.status === 'ready');

const toolText = (value: unknown) => {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.length > 8192 ? `${text.slice(0, 8192)}…` : text;
};

export function employeeView(
  view: EmployeeView,
  employee: Employee,
  agentId: string,
  session: EmployeeSession,
): TeamChatView {
  const lastUser = view.messages.findLastIndex((message) => message.role === 'user');
  const latestAssistant = view.messages.findLast(
    (message, index) => index > lastUser && message.role === 'assistant',
  )?.id;
  const messages = view.messages.map((message): TeamMessage => {
    const current = message.id === latestAssistant;
    const state =
      current && view.run?.state === 'running'
        ? 'streaming'
        : current && view.run?.state === 'cancelled'
          ? 'cancelled'
          : current && view.run?.state === 'failed'
            ? 'error'
            : 'success';
    const tools: TeamMessage['tools'][number][] = [];
    const parts: TeamMessage['parts'][number][] = [];
    for (const [index, part] of message.parts.entries()) {
      if (part.type === 'text' || part.type === 'reasoning') {
        parts.push({
          id: `${message.id}:${index}`,
          type: part.type,
          text: part.text,
          state: state === 'streaming' && part.state !== 'done' ? 'streaming' : 'done',
        });
      } else if (part.type === 'dynamic-tool') {
        if (
          state === 'cancelled' &&
          part.state === 'output-error' &&
          /^(?:interrupted|<harness>\s*\[error\] Tool .+ was aborted\s*<\/harness>)$/i.test(
            part.errorText,
          )
        )
          continue;
        parts.push({ type: 'tool', id: part.toolCallId });
        tools.push({
          id: part.toolCallId,
          name: part.toolName,
          state:
            part.state === 'output-available'
              ? 'completed'
              : part.state === 'output-error'
                ? 'failed'
                : 'input-ready',
          input: toolText(part.input),
          ...(part.state === 'output-available'
            ? { output: toolText(part.output) }
            : part.state === 'output-error'
              ? { output: toolText(part.errorText) }
              : {}),
        });
      }
    }
    const timing = message.timing;
    return {
      id: message.id,
      role: message.role,
      status: state,
      parts,
      tools,
      createdAt: message.createdAt,
      modelName: message.model,
      ...(message.usage || timing?.completedAt
        ? {
            usage: {
              ...message.usage,
              ...(timing?.completedAt
                ? {
                    durationMs: Math.max(
                      0,
                      Date.parse(timing.completedAt) - Date.parse(timing.startedAt),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
  });
  const ready = isReady(employee, agentId);
  return {
    messages,
    run: view.run ? { id: view.run.requestId, state: view.run.state } : null,
    pending: view.pending,
    canSend:
      ready &&
      (session.channel === false ||
        (employee.runtimeKind === 'hermes' && session.channel === undefined)) &&
      view.pending.length === 0 &&
      (!view.run || ['done', 'cancelled', 'failed'].includes(view.run.state)),
    canStop: ready && view.run?.state === 'running',
    canRespond: ready && employee.runtimeKind === 'hermes' && view.canApprove,
  };
}
