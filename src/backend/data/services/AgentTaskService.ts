import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type {
  ScheduledTaskEntity,
  TaskRunLogEntity,
} from '@cherrystudio/universal/data/api/schemas/agents';
import { AgentSessionWorkspaceSourceSchema } from '@cherrystudio/universal/data/api/schemas/agentWorkspaces';
import { and, desc, eq, ne } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { jobScheduleTable } from '@/backend/data/db/schemas/job';

import type { AgentChannelService } from './AgentChannelService';
import type { JobService } from './JobService';
import { timestampToISO } from './utils/rowMappers';

const AGENT_TASK_TYPE = 'agent.task';
const HEARTBEAT_TASK_NAME = 'heartbeat';

type TaskTemplate = {
  agentId: string;
  prompt: string;
  timeoutMinutes: number;
  workspace: ScheduledTaskEntity['workspace'];
};

function parseTemplate(value: unknown): TaskTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TaskTemplate>;
  const workspace = AgentSessionWorkspaceSourceSchema.safeParse(candidate.workspace);
  if (
    typeof candidate.agentId !== 'string' ||
    typeof candidate.prompt !== 'string' ||
    !workspace.success
  ) {
    return null;
  }
  return {
    agentId: candidate.agentId,
    prompt: candidate.prompt,
    timeoutMinutes: typeof candidate.timeoutMinutes === 'number' ? candidate.timeoutMinutes : 2,
    workspace: workspace.data,
  };
}

export class AgentTaskService {
  constructor(
    private readonly dbService: DbService,
    private readonly channelService: AgentChannelService,
    private readonly jobService: JobService,
  ) {}

  private async toEntity(row: typeof jobScheduleTable.$inferSelect): Promise<ScheduledTaskEntity> {
    const template = parseTemplate(row.jobInputTemplate);
    if (!template) {
      throw DataApiErrorFactory.invalidOperation('read task', 'invalid agent task template');
    }
    const channels = await this.channelService.getSubscribedChannels(row.id);
    return {
      agentId: template.agentId,
      channelIds: channels.map(({ id }) => id),
      createdAt: timestampToISO(row.createdAt),
      enabled: row.enabled,
      id: row.id,
      lastRun: row.lastRun === null ? null : timestampToISO(row.lastRun),
      name: row.name,
      nextRun: row.nextRun === null ? null : timestampToISO(row.nextRun),
      prompt: template.prompt,
      status: !row.enabled
        ? 'paused'
        : row.trigger.kind === 'once' && row.nextRun === null && row.lastRun !== null
          ? 'completed'
          : 'active',
      timeoutMinutes: template.timeoutMinutes,
      trigger: row.trigger,
      updatedAt: timestampToISO(row.updatedAt),
      workspace: template.workspace,
    };
  }

  private async listRows(agentId?: string) {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(jobScheduleTable)
      .where(
        and(
          eq(jobScheduleTable.type, AGENT_TASK_TYPE),
          ne(jobScheduleTable.name, HEARTBEAT_TASK_NAME),
        ),
      )
      .orderBy(desc(jobScheduleTable.createdAt));
    return agentId
      ? rows.filter((row) => parseTemplate(row.jobInputTemplate)?.agentId === agentId)
      : rows.filter((row) => parseTemplate(row.jobInputTemplate) !== null);
  }

  async getTaskById(taskId: string): Promise<ScheduledTaskEntity | null> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(jobScheduleTable)
      .where(and(eq(jobScheduleTable.id, taskId), eq(jobScheduleTable.type, AGENT_TASK_TYPE)))
      .limit(1);
    return row && parseTemplate(row.jobInputTemplate) ? this.toEntity(row) : null;
  }

  async getTask(agentId: string, taskId: string): Promise<ScheduledTaskEntity | null> {
    const task = await this.getTaskById(taskId);
    return task?.agentId === agentId ? task : null;
  }

  async listAllTasks(options: { limit?: number; offset?: number } = {}) {
    const rows = await this.listRows();
    return {
      tasks: await Promise.all(
        rows
          .slice(
            options.offset ?? 0,
            options.limit ? (options.offset ?? 0) + options.limit : undefined,
          )
          .map((row) => this.toEntity(row)),
      ),
      total: rows.length,
    };
  }

  async listTasks(agentId: string, options: { limit?: number; offset?: number } = {}) {
    const rows = await this.listRows(agentId);
    return {
      tasks: await Promise.all(
        rows
          .slice(
            options.offset ?? 0,
            options.limit ? (options.offset ?? 0) + options.limit : undefined,
          )
          .map((row) => this.toEntity(row)),
      ),
      total: rows.length,
    };
  }

  async getTaskLogs(
    taskId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ logs: TaskRunLogEntity[]; total: number }> {
    const jobs = await this.jobService.list({ scheduleId: taskId });
    const page = jobs.slice(
      options.offset ?? 0,
      options.limit ? (options.offset ?? 0) + options.limit : undefined,
    );
    return {
      logs: page.map((job) => {
        const output = job.output as { result?: string; sessionId?: string } | null;
        const startedAt = job.startedAt ?? job.scheduledAt;
        const start = Date.parse(startedAt);
        const finish = job.finishedAt ? Date.parse(job.finishedAt) : Number.NaN;
        return {
          durationMs: Number.isFinite(finish - start) ? Math.max(0, finish - start) : 0,
          error: job.error?.message ?? null,
          id: job.id,
          result:
            typeof output?.result === 'string'
              ? output.result
              : output === null
                ? null
                : JSON.stringify(output),
          scheduleId: job.scheduleId ?? '',
          sessionId: output?.sessionId ?? null,
          startedAt,
          status: job.status === 'pending' || job.status === 'delayed' ? 'running' : job.status,
        };
      }),
      total: jobs.length,
    };
  }
}
