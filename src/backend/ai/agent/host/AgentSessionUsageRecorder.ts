import {
  aiUsageRecordService,
  type AiUsageRecordService,
} from '@/backend/data/services/AiUsageRecordService';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { RuntimeUsageReport } from '../runtime';
import type { AgentDefinition } from './agentDefinitions';

type UsageRecorderDependencies = {
  usage: Pick<AiUsageRecordService, 'recordInvocation'>;
};

type RecordAgentSessionUsageInput = {
  agent: AgentDefinition;
  assistantMessageId: string;
  report: RuntimeUsageReport;
  turnId: string;
};

const logger = loggerService.withContext('AgentSessionUsageRecorder');

/** Best-effort analytical projection for the single provider call in a V1 Agent turn. */
export class AgentSessionUsageRecorder {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly dependencies: UsageRecorderDependencies = {
      usage: aiUsageRecordService,
    },
  ) {}

  record(input: RecordAgentSessionUsageInput): void {
    const operation = this.recordNow(input).catch((error: unknown) => {
      logger.warn('Failed to record Agent Session usage', error as Error, {
        turnId: input.turnId,
      });
    });
    this.inFlight.add(operation);
    void operation.finally(() => this.inFlight.delete(operation));
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.inFlight);
  }

  private async recordNow(input: RecordAgentSessionUsageInput): Promise<void> {
    await this.dependencies.usage.recordInvocation({
      completedAt: input.report.completedAt,
      context: {
        ...input.report.context,
        messageRef: { id: input.assistantMessageId, kind: 'agent-session' },
        source: { icon: null, id: input.agent.id, name: input.agent.name, type: 'agent' },
      },
      modality: 'language',
      requestId: `agent-session-turn:${input.turnId}`,
      usage: input.report.usage,
    });
  }
}
