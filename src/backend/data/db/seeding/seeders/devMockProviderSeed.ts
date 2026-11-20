import { and, eq } from 'drizzle-orm';

import {
  DEFAULT_PREFERENCE_SCOPE,
  preferenceTable,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import {
  DEV_MOCK_MODEL_ID,
  DEV_MOCK_MODEL_NAME,
  DEV_MOCK_PROVIDER_HOST,
  DEV_MOCK_PROVIDER_ID,
  DEV_MOCK_PROVIDER_NAME,
  DEV_MOCK_UNIQUE_MODEL_ID,
} from '@/shared/utils/devMockProvider';

import type { DbService } from '../../DbService';

export async function syncDevMockProvider(dbService: DbService, enabled: boolean): Promise<void> {
  await dbService.withWriteTx(async (tx) => {
    const provider = eq(userProviderTable.providerId, DEV_MOCK_PROVIDER_ID);
    const model = eq(userModelTable.id, DEV_MOCK_UNIQUE_MODEL_ID);
    const defaultModel = and(
      eq(preferenceTable.scope, DEFAULT_PREFERENCE_SCOPE),
      eq(preferenceTable.key, 'agent.default_model_id'),
    );

    if (!enabled) {
      // Keep fixture metadata for existing transcripts while withdrawing the selectable model.
      await tx
        .update(userProviderTable)
        .set({ isEnabled: false })
        .where(and(provider, eq(userProviderTable.isEnabled, true)));
      await tx
        .update(userModelTable)
        .set({ isEnabled: false })
        .where(and(model, eq(userModelTable.isEnabled, true)));
      await tx
        .update(preferenceTable)
        .set({ value: null })
        .where(and(defaultModel, eq(preferenceTable.value, DEV_MOCK_UNIQUE_MODEL_ID)));
      return;
    }

    await tx
      .insert(userProviderTable)
      .values({
        providerId: DEV_MOCK_PROVIDER_ID,
        presetProviderId: null,
        name: DEV_MOCK_PROVIDER_NAME,
        endpointConfigs: {
          'openai-chat-completions': {
            baseUrl: DEV_MOCK_PROVIDER_HOST,
            adapterFamily: 'openai-compatible',
          },
        },
        defaultChatEndpoint: 'openai-chat-completions',
        apiKeys: [
          {
            id: 'dev-mock-key',
            isEnabled: true,
            key: 'dev-mock-local-key',
            label: 'Dev Mock',
          },
        ],
        authConfig: { type: 'api-key', required: false },
        isEnabled: true,
        orderKey: 'a0',
      })
      .onConflictDoUpdate({ target: userProviderTable.providerId, set: { isEnabled: true } });

    await tx
      .insert(userModelTable)
      .values({
        id: DEV_MOCK_UNIQUE_MODEL_ID,
        providerId: DEV_MOCK_PROVIDER_ID,
        modelId: DEV_MOCK_MODEL_ID,
        presetModelId: null,
        name: DEV_MOCK_MODEL_NAME,
        capabilities: ['function-call', 'reasoning'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        endpointTypes: ['openai-chat-completions'],
        contextWindow: 32_768,
        maxOutputTokens: 4_096,
        supportsStreaming: true,
        isEnabled: true,
        orderKey: 'a0',
      })
      .onConflictDoUpdate({ target: userModelTable.id, set: { isEnabled: true } });

    const existingDefault = await tx
      .select({ value: preferenceTable.value })
      .from(preferenceTable)
      .where(defaultModel)
      .limit(1);

    if (existingDefault.length === 0) {
      await tx
        .insert(preferenceTable)
        .values({
          scope: DEFAULT_PREFERENCE_SCOPE,
          key: 'agent.default_model_id',
          value: DEV_MOCK_UNIQUE_MODEL_ID,
        })
        .onConflictDoNothing();
    } else if (existingDefault[0]?.value === null) {
      await tx.update(preferenceTable).set({ value: DEV_MOCK_UNIQUE_MODEL_ID }).where(defaultModel);
    }
  });
}
