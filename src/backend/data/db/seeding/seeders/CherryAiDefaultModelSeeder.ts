import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { loggerService } from '@logger';
import { eq } from 'drizzle-orm';

import {
  preferenceTable,
  type InsertUserModelRow,
  type InsertUserProviderRow,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import {
  CHERRYAI_API_BASE_URL,
  CHERRYAI_DEFAULT_MODEL_GROUP,
  CHERRYAI_DEFAULT_MODEL_ID,
  CHERRYAI_DEFAULT_MODEL_NAME,
  CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
  CHERRYAI_PROVIDER_ID,
  CHERRYAI_PROVIDER_NAME,
} from '@/shared/data/presets/cherryai';
import type { ModelCapability } from '@/shared/data/types/model';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

const logger = loggerService.withContext('CherryAiDefaultModelSeeder');

export const DEFAULT_MODEL_PREFERENCE_KEYS = [
  'chat.default_model_id',
  'topic.naming.model_id',
  'feature.quick_assistant.model_id',
  'feature.translate.model_id',
] as const;

type CherryAiProviderRow = Omit<InsertUserProviderRow, 'orderKey'>;
type CherryAiDefaultModelRow = Omit<InsertUserModelRow, 'orderKey'>;

function createCherryAiProviderRow(): CherryAiProviderRow {
  return {
    apiFeatures: null,
    authConfig: null,
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: CHERRYAI_API_BASE_URL },
    },
    isEnabled: true,
    name: CHERRYAI_PROVIDER_NAME,
    presetProviderId: CHERRYAI_PROVIDER_ID,
    providerId: CHERRYAI_PROVIDER_ID,
    providerSettings: null,
  };
}

function createCherryAiDefaultModelRow(): CherryAiDefaultModelRow {
  return {
    capabilities: [] as ModelCapability[],
    contextWindow: null,
    description: null,
    endpointTypes: null,
    group: CHERRYAI_DEFAULT_MODEL_GROUP,
    id: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
    inputModalities: null,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    maxInputTokens: null,
    maxOutputTokens: null,
    modelId: CHERRYAI_DEFAULT_MODEL_ID,
    name: CHERRYAI_DEFAULT_MODEL_NAME,
    notes: null,
    outputModalities: null,
    parameters: null,
    presetModelId: null,
    pricing: null,
    providerId: CHERRYAI_PROVIDER_ID,
    reasoning: null,
    supportsStreaming: true,
  };
}

function createDefaultModelPreferenceRows() {
  return DEFAULT_MODEL_PREFERENCE_KEYS.map((key) => ({
    key,
    value: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
  }));
}

export class CherryAiDefaultModelSeeder implements DatabaseSeeder {
  readonly name = 'cherryaiDefaultModel';
  readonly description = 'Ensure CherryAI default provider, model, and default model preferences';
  readonly version = hashObject({
    model: createCherryAiDefaultModelRow(),
    preferences: createDefaultModelPreferenceRows(),
    provider: createCherryAiProviderRow(),
  });

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await dbService.withWriteTx(async (tx) => {
      const [provider] = await tx
        .select({ providerId: userProviderTable.providerId })
        .from(userProviderTable)
        .where(eq(userProviderTable.providerId, CHERRYAI_PROVIDER_ID))
        .limit(1);

      if (!provider) {
        await insertWithOrderKey(tx, userProviderTable, createCherryAiProviderRow(), {
          pkColumn: userProviderTable.providerId,
        });
        logger.warn('Self-healed missing CherryAI default provider', {
          providerId: CHERRYAI_PROVIDER_ID,
        });
      }

      const [model] = await tx
        .select({ id: userModelTable.id })
        .from(userModelTable)
        .where(eq(userModelTable.id, CHERRYAI_DEFAULT_UNIQUE_MODEL_ID))
        .limit(1);

      if (!model) {
        await insertWithOrderKey(tx, userModelTable, createCherryAiDefaultModelRow(), {
          pkColumn: userModelTable.id,
          scope: eq(userModelTable.providerId, CHERRYAI_PROVIDER_ID),
        });
        logger.warn('Self-healed missing CherryAI default model', {
          modelId: CHERRYAI_DEFAULT_UNIQUE_MODEL_ID,
        });
      }

      for (const preference of createDefaultModelPreferenceRows()) {
        const [existing] = await tx
          .select({ key: preferenceTable.key })
          .from(preferenceTable)
          .where(eq(preferenceTable.key, preference.key))
          .limit(1);

        if (existing) {
          continue;
        }

        await tx.insert(preferenceTable).values(preference);
        logger.warn('Self-healed missing default model preference', {
          key: preference.key,
          value: preference.value,
        });
      }
    });
  }
}
