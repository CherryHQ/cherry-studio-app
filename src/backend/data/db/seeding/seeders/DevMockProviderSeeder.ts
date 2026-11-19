import { eq } from 'drizzle-orm';

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
  isDevMockProviderEnabled,
} from '@/shared/utils/devMockProvider';

import type { DatabaseSeeder } from '../types';

/**
 * Seeds a local offline OpenAI-compatible mock provider/model when running a dev build with
 * `EXPO_PUBLIC_DEV_MOCK_PROVIDER=1`. Never activates in production or ordinary dev runs.
 */
export class DevMockProviderSeeder implements DatabaseSeeder {
  readonly name = 'dev-mock-provider';
  readonly description = 'Install offline deterministic mock provider for dev E2E verification';
  readonly version = '1';

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    if (!isDevMockProviderEnabled()) return;

    await dbService.withWriteTx(async (tx) => {
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
        .onConflictDoNothing();

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
        .onConflictDoNothing();

      const existingDefault = await tx
        .select({ value: preferenceTable.value })
        .from(preferenceTable)
        .where(eq(preferenceTable.key, 'agent.default_model_id'))
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
        await tx
          .update(preferenceTable)
          .set({ value: DEV_MOCK_UNIQUE_MODEL_ID })
          .where(eq(preferenceTable.key, 'agent.default_model_id'));
      }
    });
  }
}
