import { fetch as expoFetch } from 'expo/fetch';
import { v4 as uuid } from 'uuid';
import * as z from 'zod';

import { isHttpError } from '@/backend/services/http';
import type { TeamAgentAdapter, TeamAgentConnection } from '@/backend/services/teamAgent';
import { AccountError } from '@/shared/contracts/account';
import {
  TeamAgentError,
  type TeamAgent,
  type TeamSession,
  type TeamSessionRef,
  type TeamSubmission,
  type TeamSubmitResult,
} from '@/shared/contracts/teamAgent';

import type { AccountRuntime } from '../account/AccountRuntime';
import { createEnterpriseRequest } from '../enterpriseApi';
import {
  chatViewSchema,
  detailSchema,
  employeeAgentId,
  employeesSchema,
  employeeTarget,
  employeeView,
  isReady,
  runSchema,
  sessionSchema,
  type Employee,
  type EmployeeSession,
} from './employeeProtocol';
import { createEmployeeSnapshotParser } from './employeeSnapshots';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const inputSchema = z
  .string()
  .min(1)
  .max(16000)
  .refine((text) => text.trim().length > 0 && !text.includes('\0'));
function teamError(error: unknown): TeamAgentError {
  if (error instanceof TeamAgentError) return error;
  if (error instanceof AccountError) return new TeamAgentError('signed-out');
  if (error instanceof z.ZodError) return new TeamAgentError('unsupported');
  const status = isHttpError(error) ? error.status : undefined;
  const code =
    status === 401
      ? 'signed-out'
      : status === 403 || status === 404
        ? 'not-visible'
        : status === 422
          ? 'unsupported'
          : status === 400
            ? 'invalid-input'
            : status === 409
              ? 'busy'
              : status === 503
                ? 'unavailable'
                : 'offline';
  return new TeamAgentError(code, status);
}
const explicitRejection = (error: unknown) =>
  error instanceof TeamAgentError &&
  error.status !== undefined &&
  [400, 401, 403, 404, 409, 422, 429].includes(error.status);

/** Enterprise account details stay here; the common team owner receives only normalized values. */
export function createEnterpriseTeamAdapter(
  account: Pick<AccountRuntime, 'getEnterpriseContext' | 'createEnterpriseSession' | 'subscribe'>,
): TeamAgentAdapter {
  let cached: TeamAgentConnection | null = null;
  return {
    subscribe: account.subscribe,
    current() {
      const context = account.getEnterpriseContext();
      if (!context) {
        cached = null;
        return null;
      }
      if (cached?.context.key === context.key) return cached;
      const session = account.createEnterpriseSession();
      const request = createEnterpriseRequest({
        baseUrl: context.address,
        session,
      });
      const employees = new Map<string, Employee>();
      const sessions = new Map<string, EmployeeSession[]>();
      const assertCurrent = () => {
        if (account.getEnterpriseContext()?.key !== context.key)
          throw new TeamAgentError('retired');
      };
      const read = async <T>(work: () => Promise<T>) => {
        assertCurrent();
        try {
          const result = await work();
          assertCurrent();
          return result;
        } catch (error) {
          assertCurrent();
          throw teamError(error);
        }
      };
      const base = (id: string) => {
        const target = employeeTarget(id);
        return `/ai-employees/${target.employeeId}/agents/${target.agentId}`;
      };
      const path = (target: TeamSessionRef) => {
        if (!z.uuid().safeParse(target.sessionId).success)
          throw new TeamAgentError('invalid-input');
        return `${base(target.agentId)}/sessions/${target.sessionId}`;
      };
      const employeeFor = (id: string) => {
        const { employeeId, agentId } = employeeTarget(id);
        const employee = employees.get(employeeId);
        if (!employee?.agents.some((agent) => agent.id === agentId))
          throw new TeamAgentError('not-visible');
        return { employee, agentId };
      };
      const sessionValue = (id: string, session: EmployeeSession): TeamSession => {
        const { employee, agentId } = employeeFor(id);
        return {
          agentId: id,
          sessionId: session.id,
          title: session.title,
          createdAt: session.created_at,
          canDelete:
            isReady(employee, agentId) &&
            employee.runtimeKind === 'astra' &&
            session.canDelete === true,
        };
      };
      const listSessions = (id: string, signal: AbortSignal) =>
        read(async () => {
          const response = await request<unknown>({
            method: 'GET',
            path: `${base(id)}/sessions`,
            signal,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          });
          const rows = z.object({ sessions: z.array(sessionSchema) }).parse(response.data).sessions;
          sessions.set(id, rows);
          return rows.map((session) => sessionValue(id, session));
        });
      const metadata = async (target: TeamSessionRef, signal: AbortSignal) => {
        const findSession = () =>
          sessions.get(target.agentId)?.find((row) => row.id === target.sessionId);
        let session = findSession();
        if (!session) {
          await listSessions(target.agentId, signal);
          session = findSession();
        }
        if (!session) throw new TeamAgentError('not-visible');
        return { ...employeeFor(target.agentId), session };
      };
      const loadView = (target: TeamSessionRef, signal: AbortSignal) =>
        read(async () => {
          const meta = await metadata(target, signal);
          const response = await request<unknown>({
            method: 'GET',
            path: path(target),
            signal,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          });
          const view = chatViewSchema.parse(response.data);
          return { view, meta };
        });
      const postRun = (target: TeamSessionRef, submission: TeamSubmission, signal: AbortSignal) =>
        read(async () => {
          const response = await request<unknown>({
            method: 'POST',
            path: `${path(target)}/inputs`,
            body: submission,
            signal,
            maxResponseBytes: MAX_RESPONSE_BYTES,
          });
          return runSchema.parse(response.data);
        });
      cached = {
        context: { bindingId: 'enterprise', key: context.key, name: context.name },
        listAgents: (signal) =>
          read(async () => {
            const response = await request<unknown>({
              method: 'GET',
              path: '/ai-employees',
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
            const rows = employeesSchema.parse(response.data);
            employees.clear();
            const result: TeamAgent[] = [];
            for (const employee of rows) {
              employees.set(employee.id, employee);
              for (const agent of employee.agents)
                result.push({
                  id: employeeAgentId(employee.id, agent.id),
                  name: agent.name,
                  description: agent.description,
                  groupName: employee.name,
                  canCreateSession: isReady(employee, agent.id),
                  maxInputLength: 16000,
                });
            }
            const visible = new Set(result.map((agent) => agent.id));
            for (const id of sessions.keys()) if (!visible.has(id)) sessions.delete(id);
            return result;
          }),
        listSessions,
        createSession: (id, signal) =>
          read(async () => {
            const { employee, agentId } = employeeFor(id);
            if (!isReady(employee, agentId)) throw new TeamAgentError('unavailable');
            const response = await request<unknown>({
              method: 'POST',
              path: `${base(id)}/sessions`,
              body: { id: uuid() },
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
            sessions.delete(id);
            return sessionValue(id, sessionSchema.parse(response.data));
          }),
        deleteSession: (target, signal) =>
          read(async () => {
            await request({
              method: 'DELETE',
              path: path(target),
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
            sessions.delete(target.agentId);
          }),
        readDetail: (id, signal) =>
          read(async () => {
            const response = await request<unknown>({
              method: 'GET',
              path: `${base(id)}/configuration`,
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
            return detailSchema.parse(response.data);
          }),
        readPortrait: async (id, signal) => {
          try {
            return await read(async () => {
              const response = await request<ArrayBuffer>({
                method: 'GET',
                path: `${base(id)}/portrait`,
                signal,
                responseType: 'arraybuffer',
                maxResponseBytes: 256 * 1024,
              });
              const bytes = new Uint8Array(response.data);
              if (
                bytes.length < 12 ||
                String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
                String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
              )
                return undefined;
              let binary = '';
              for (const byte of bytes) binary += String.fromCharCode(byte);
              return `data:image/webp;base64,${btoa(binary)}`;
            });
          } catch (error) {
            assertCurrent();
            if (error instanceof TeamAgentError && ['signed-out', 'retired'].includes(error.code))
              throw error;
            return undefined;
          }
        },
        readView: async (target, signal) => {
          const { view, meta } = await loadView(target, signal);
          return employeeView(view, meta.employee, meta.agentId, meta.session);
        },
        watch: (target, signal, snapshot) =>
          read(async () => {
            const meta = await metadata(target, signal);
            const token = await session.getProductToken();
            assertCurrent();
            const idle = new AbortController();
            let timer: ReturnType<typeof setTimeout>;
            const heartbeat = () => {
              clearTimeout(timer);
              timer = setTimeout(() => idle.abort(), 45_000);
            };
            heartbeat();
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            try {
              const response = await expoFetch(`${context.address}${path(target)}/events`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
                signal: AbortSignal.any([signal, idle.signal]),
                redirect: 'error',
                credentials: 'omit',
              });
              assertCurrent();
              if (!response.ok) {
                await response.body?.cancel().catch(() => {});
                if (response.status === 401) await session.refuseProductToken(token);
                assertCurrent();
                throw new TeamAgentError(
                  response.status === 403 || response.status === 404
                    ? 'not-visible'
                    : response.status === 422
                      ? 'unsupported'
                      : response.status === 503
                        ? 'unavailable'
                        : 'offline',
                  response.status,
                );
              }
              if (
                !response.headers.get('content-type')?.includes('text/event-stream') ||
                !response.body
              ) {
                await response.body?.cancel().catch(() => {});
                throw new TeamAgentError('unsupported');
              }
              let terminal = false;
              const parse = createEmployeeSnapshotParser((value) => {
                assertCurrent();
                signal.throwIfAborted();
                const view = chatViewSchema.parse(value);
                const currentMeta = employeeFor(target.agentId);
                snapshot(
                  employeeView(view, currentMeta.employee, currentMeta.agentId, meta.session),
                );
                terminal = view.run?.state !== 'running';
              });
              reader = response.body.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                heartbeat();
                parse(decoder.decode(chunk.value, { stream: true }));
                if (terminal) break;
              }
            } finally {
              clearTimeout(timer!);
              idle.abort();
              await reader?.cancel().catch(() => {});
            }
          }),
        submit: async (target, submission, signal): Promise<TeamSubmitResult> => {
          const assertSubmitting = () => {
            if (signal.aborted) throw new TeamAgentError('retired');
            assertCurrent();
          };
          assertSubmitting();
          if (!inputSchema.safeParse(submission.input).success) return 'rejected';
          const { view, meta } = await loadView(target, signal).catch((error: unknown) => {
            assertSubmitting();
            throw error;
          });
          assertSubmitting();
          if (!employeeView(view, meta.employee, meta.agentId, meta.session).canSend)
            return 'rejected';
          let run;
          try {
            run = await postRun(target, submission, signal);
          } catch (error) {
            assertSubmitting();
            if (explicitRejection(error)) return 'rejected';
            try {
              const response = await request<unknown>({
                method: 'GET',
                path: `${path(target)}/inputs/${submission.requestId}`,
                signal,
                maxResponseBytes: MAX_RESPONSE_BYTES,
              });
              assertSubmitting();
              run = runSchema.parse(response.data);
              if (
                run.state === 'missing' &&
                meta.employee.runtimeKind === 'astra' &&
                view.idempotentSubmit
              )
                run = await postRun(target, submission, signal);
            } catch {
              assertSubmitting();
              return 'unknown';
            }
          }
          assertSubmitting();
          return run.state === 'missing' || run.state === 'unknown'
            ? 'unknown'
            : run.state === 'busy'
              ? 'rejected'
              : 'accepted';
        },
        stop: (target, runId, signal) =>
          read(async () => {
            const response = await request<unknown>({
              method: 'POST',
              path: `${path(target)}/inputs/${encodeURIComponent(runId)}/cancel`,
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
            runSchema.parse(response.data);
          }),
        respond: (target, pendingId, requestId, reply, signal) =>
          read(async () => {
            if (
              !pendingId ||
              pendingId.length > 256 ||
              !requestId ||
              requestId.length > 256 ||
              ('text' in reply && !inputSchema.safeParse(reply.text).success)
            )
              throw new TeamAgentError('invalid-input');
            await request({
              method: 'POST',
              path: `${path(target)}/responses`,
              body: { pendingId, requestId, ...reply },
              signal,
              maxResponseBytes: MAX_RESPONSE_BYTES,
            });
          }),
      };
      return cached;
    },
  };
}
