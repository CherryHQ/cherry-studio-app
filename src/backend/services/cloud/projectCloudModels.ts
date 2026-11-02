import { eq } from 'drizzle-orm';

import type { Database } from '@/backend/data/db/DbService';
import { userModelTable, userProviderTable } from '@/backend/data/db/schemas';
import { inferCustomModelReasoning } from '@/backend/data/services/ProviderRegistryService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import { CLOUD_PROVIDER_ID, type CloudModel } from '@/shared/contracts/cloud';
import {
  createUniqueModelId,
  MODEL_CAPABILITY,
  type ModelCapability,
} from '@/shared/data/types/model';

/** Retain rows referenced by history, but revoke all model availability before applying a snapshot. */
export async function projectCloudModels(
  tx: Database,
  origin: string,
  models: readonly CloudModel[],
  assertCurrent: () => void,
): Promise<string[]> {
  assertCurrent();
  const where = eq(userProviderTable.providerId, CLOUD_PROVIDER_ID);
  const [existing] = await tx.select().from(userProviderTable).where(where);
  const previous = await tx
    .select({ id: userModelTable.id })
    .from(userModelTable)
    .where(eq(userModelTable.providerId, CLOUD_PROVIDER_ID));
  const modelIds = new Set(previous.map((model) => model.id));
  if (existing || models.length) {
    const provider = {
      providerId: CLOUD_PROVIDER_ID,
      name: 'Cherry Cloud',
      presetProviderId: null,
      isEnabled: models.length > 0,
      endpointConfigs: {
        'anthropic-messages': { baseUrl: origin, adapterFamily: 'anthropic' },
        'openai-chat-completions': { baseUrl: origin, adapterFamily: 'openai-compatible' },
      },
      defaultChatEndpoint: 'anthropic-messages' as const,
      apiKeys: [],
      authConfig: { type: 'api-key' as const },
    };
    if (existing) await tx.update(userProviderTable).set(provider).where(where);
    else
      await insertWithOrderKey(tx, userProviderTable, provider, {
        pkColumn: userProviderTable.providerId,
      });
  }
  await tx
    .update(userModelTable)
    .set({ isEnabled: false, isHidden: true })
    .where(eq(userModelTable.providerId, CLOUD_PROVIDER_ID));
  for (const model of models) {
    assertCurrent();
    const id = createUniqueModelId(CLOUD_PROVIDER_ID, model.id);
    const capabilities = model.capabilities.filter((capability): capability is ModelCapability =>
      [
        MODEL_CAPABILITY.FUNCTION_CALL,
        MODEL_CAPABILITY.REASONING,
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
      ].some((supported) => supported === capability),
    );
    const values = {
      modelId: model.id,
      name: model.display_name,
      capabilities,
      contextWindow: model.context_window,
      maxOutputTokens: model.max_output_tokens,
      endpointTypes: [model.endpoint_type],
      supportsStreaming: true,
      reasoning:
        inferCustomModelReasoning(model.id, undefined, {
          declaredReasoning: capabilities.includes(MODEL_CAPABILITY.REASONING),
        }) ?? null,
      isEnabled: true,
      isHidden: false,
    };
    if (modelIds.has(id))
      await tx.update(userModelTable).set(values).where(eq(userModelTable.id, id));
    else
      await insertWithOrderKey(
        tx,
        userModelTable,
        { ...values, id, providerId: CLOUD_PROVIDER_ID },
        { pkColumn: userModelTable.id, scope: eq(userModelTable.providerId, CLOUD_PROVIDER_ID) },
      );
    modelIds.add(id);
  }
  assertCurrent();
  return [...modelIds];
}
