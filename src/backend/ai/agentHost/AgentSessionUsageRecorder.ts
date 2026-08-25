import { createAiUsageCaptureContext } from '@cherrystudio/ai-runtime/utils';

import type { RuntimeUsage } from '@/backend/ai/agent';
import {
  aiUsageRecordService,
  type AiUsageRecordService,
} from '@/backend/data/services/AiUsageRecordService';
import { modelService, type ModelService } from '@/backend/data/services/ModelService';
import { providerService, type ProviderService } from '@/backend/data/services/ProviderService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { AgentDefinition } from './agentDefinitions';

type UsageRecorderDependencies = {
  model: Pick<ModelService, 'getById'>;
  provider: Pick<ProviderService, 'getByProviderId'>;
  usage: Pick<AiUsageRecordService, 'recordInvocation'>;
};

type RecordAgentSessionUsageInput = {
  agent: AgentDefinition;
  assistantMessageId: string;
  completedAt: number;
  startedAt: number;
  turnId: string;
  usage: RuntimeUsage;
};

const logger = loggerService.withContext('AgentSessionUsageRecorder');

/** Best-effort analytical projection for the single provider call in a V1 Agent turn. */
export class AgentSessionUsageRecorder {
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly dependencies: UsageRecorderDependencies = {
      model: modelService,
      provider: providerService,
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
    await Promise.allSettled([...this.inFlight]);
  }

  private async recordNow(input: RecordAgentSessionUsageInput): Promise<void> {
    const uniqueModelId = createUniqueModelId(
      input.agent.model.providerId,
      input.agent.model.modelId,
    );
    const [model, provider] = await Promise.all([
      this.dependencies.model.getById(uniqueModelId),
      this.dependencies.provider.getByProviderId(input.agent.model.providerId),
    ]);

    await this.dependencies.usage.recordInvocation({
      completedAt: input.completedAt,
      context: createAiUsageCaptureContext({
        credentialReceipt: { attribution: 'unknown' },
        messageRef: { id: input.assistantMessageId, kind: 'agent-session' },
        modelId: model?.apiModelId ?? input.agent.model.modelId,
        modelName: model?.name ?? null,
        pricing: model?.pricing,
        providerId: provider.id,
        providerName: provider.name,
        reportedCostCurrency: provider.reportedCostCurrency,
        source: { icon: null, id: input.agent.id, name: input.agent.name, type: 'agent' },
        trustProviderReportedCost: provider.apiFeatures.reportsActualCost,
      }),
      metrics: { timeCompletionMs: Math.max(0, input.completedAt - input.startedAt) },
      modality: 'language',
      requestId: `agent-session-turn:${input.turnId}`,
      usage: input.usage,
    });
  }
}
