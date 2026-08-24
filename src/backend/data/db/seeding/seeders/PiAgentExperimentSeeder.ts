import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { and, eq, isNull } from 'drizzle-orm';

import {
  assistantTable,
  preferenceTable,
  type InsertUserModelRow,
  type InsertUserProviderRow,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import type { PiAgentExperimentConfig } from '@/shared/config/piAgentExperiment';
import { CHERRYAI_DEFAULT_UNIQUE_MODEL_ID } from '@/shared/data/presets/cherryai';
import { createUniqueModelId } from '@/shared/data/types/model';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

export const PI_AGENT_EXPERIMENT_PROVIDER_ID = 'pi-agent-experiment';
const PI_AGENT_EXPERIMENT_API_KEY_ID = 'pi-agent-experiment-key';
const LUNA_CONTEXT_WINDOW = 372_000;

type ProviderRow = Omit<InsertUserProviderRow, 'orderKey'>;
type ModelRow = Omit<InsertUserModelRow, 'orderKey'>;

export class PiAgentExperimentSeeder implements DatabaseSeeder {
  readonly name = 'piAgentExperiment';
  readonly description = 'Configure the local pi agent provider and Luna model experiment';
  readonly version: string;

  constructor(private readonly config: PiAgentExperimentConfig) {
    this.version = hashObject({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      providerName: config.providerName,
    });
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const modelId = createUniqueModelId(PI_AGENT_EXPERIMENT_PROVIDER_ID, this.config.modelId);
    const provider = createProviderRow(this.config);
    const model = createModelRow(this.config, modelId);

    await dbService.withWriteTx(async (tx) => {
      const [existingProvider] = await tx
        .select({ providerId: userProviderTable.providerId })
        .from(userProviderTable)
        .where(eq(userProviderTable.providerId, PI_AGENT_EXPERIMENT_PROVIDER_ID))
        .limit(1);

      if (existingProvider) {
        await tx
          .update(userProviderTable)
          .set(provider)
          .where(eq(userProviderTable.providerId, PI_AGENT_EXPERIMENT_PROVIDER_ID));
      } else {
        await insertWithOrderKey(tx, userProviderTable, provider, {
          pkColumn: userProviderTable.providerId,
        });
      }

      const [existingModel] = await tx
        .select({ id: userModelTable.id })
        .from(userModelTable)
        .where(eq(userModelTable.id, modelId))
        .limit(1);

      if (existingModel) {
        await tx.update(userModelTable).set(model).where(eq(userModelTable.id, modelId));
      } else {
        await insertWithOrderKey(tx, userModelTable, model, {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, PI_AGENT_EXPERIMENT_PROVIDER_ID),
        });
      }

      await tx
        .insert(preferenceTable)
        .values({ key: 'chat.default_model_id', value: modelId })
        .onConflictDoUpdate({
          target: preferenceTable.key,
          set: { value: modelId },
        });

      await tx
        .update(assistantTable)
        .set({ modelId })
        .where(
          and(
            eq(assistantTable.modelId, CHERRYAI_DEFAULT_UNIQUE_MODEL_ID),
            isNull(assistantTable.deletedAt),
          ),
        );
    });
  }
}

function createProviderRow(config: PiAgentExperimentConfig): ProviderRow {
  return {
    apiFeatures: null,
    apiKeys: [
      {
        id: PI_AGENT_EXPERIMENT_API_KEY_ID,
        isEnabled: true,
        key: config.apiKey,
        label: 'Local pi agent experiment',
      },
    ],
    authConfig: null,
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
        adapterFamily: 'openai',
        baseUrl: config.baseUrl,
      },
    },
    isEnabled: true,
    name: config.providerName,
    presetProviderId: null,
    providerId: PI_AGENT_EXPERIMENT_PROVIDER_ID,
    providerSettings: null,
  };
}

function createModelRow(config: PiAgentExperimentConfig, id: string): ModelRow {
  return {
    capabilities: [],
    contextWindow: LUNA_CONTEXT_WINDOW,
    description: 'Local pi agent experiment model',
    endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
    group: 'Pi Agent Experiment',
    id,
    inputModalities: null,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    maxInputTokens: null,
    maxOutputTokens: null,
    modelId: config.modelId,
    name: 'GPT-5.6 Luna',
    notes: null,
    outputModalities: null,
    parameters: null,
    presetModelId: null,
    pricing: null,
    providerId: PI_AGENT_EXPERIMENT_PROVIDER_ID,
    reasoning: null,
    supportsStreaming: true,
  };
}
