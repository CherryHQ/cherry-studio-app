import {
  createMcpServerMutations,
  type McpServerMutations,
} from '@/backend/data/api/handlers/mcpServers';
import type { DbService } from '@/backend/data/db/DbService';
import { materializeRemoteModels } from '@/backend/data/services/materializeRemoteModels';
import { canDeleteProvider } from '@/backend/data/services/ProviderService';
import { createUserContentImageStorage } from '@/backend/services/file/userContentImageStorage';
import { createModelsModule } from '@/backend/services/models/createModelsModule';
import { createPaintingsModule } from '@/backend/services/paintings/createPaintingsModule';
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import { createPermissionsModule } from '@/backend/services/permissions/createPermissionsModule';
import { createProfileModule } from '@/backend/services/profile/createProfileModule';
import {
  replaceUserAvatar,
  resolveUserAvatarUri,
} from '@/backend/services/profile/userAvatarStorage';
import { createProvidersModule } from '@/backend/services/providers/createProvidersModule';
import {
  deleteProviderAvatar,
  getProviderAvatarUri,
  saveProviderAvatar,
} from '@/backend/services/providers/providerAvatarStorage';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import type { Backend } from '@/shared/contracts';
import type { UniqueModelId } from '@/shared/data/types/model';

export type BackendComposition = {
  backend: Backend;
  dataApiDependencies: {
    mcpServerMutations: McpServerMutations;
  };
};

export function createBackend(
  services: BackendServices,
  infrastructure: { dbService: DbService },
): BackendComposition {
  const { dbService } = infrastructure;
  const models = createModelsModule({
    ai: services.ai,
    materializeRemoteModels,
    models: {
      get: (id) => services.model.getById(id),
      list: (query) => services.model.list(query),
      reconcile: async (providerId, input, provider) => {
        const result = await services.model.reconcileProviderModels(
          providerId,
          input,
          providerConfiguration(provider),
        );
        return { ...result, removedIds: result.removedIds as UniqueModelId[] };
      },
    },
    providers: {
      get: (id) => services.provider.getByProviderId(id),
      update: (id, input) => services.provider.update(id, input),
    },
  });
  const paintings = createPaintingsModule({
    db: { withWriteTx: (fn) => dbService.withWriteTx(fn) },
    files: services.fileContent,
    jobs: {
      cancelGenerate: async (jobId) => {
        await services.jobRuntime.cancel(jobId);
      },
      enqueueGenerateTx: (tx, input, opts) =>
        services.jobRuntime.enqueueTx(tx, 'painting.generate', input, opts),
      findActiveGenerateTx: (tx, idempotencyKey) =>
        services.job.findActiveByIdempotencyKeyTx(tx, idempotencyKey),
    },
    paintings: services.painting,
    storage: paintingFileStorage,
  });
  const mcpServerMutations = createMcpServerMutations({
    runtime: services.mcpRuntime,
    servers: services.mcpServer,
  });
  const providers = createProvidersModule({
    avatars: {
      persist: saveProviderAvatar,
      remove: deleteProviderAvatar,
      resolve: getProviderAvatarUri,
    },
    canRemove: canDeleteProvider,
  });
  const permissions = createPermissionsModule({
    device: {
      getStatus: (scope) => services.devicePermissions.getStatusForScope(scope),
      openSystemSettings: (permission) => services.devicePermissions.openSystemSettings(permission),
      request: (scope) => services.devicePermissions.requestForScope(scope),
    },
  });
  const userContentImages = createUserContentImageStorage();
  const profile = createProfileModule({
    avatars: {
      replace: (sourceUri, previousAvatar, persist) =>
        replaceUserAvatar(userContentImages, sourceUri, previousAvatar, persist),
      resolve: (avatar) => resolveUserAvatarUri(userContentImages, avatar),
    },
    preferences: {
      readAvatar: () => services.preference.readCached('app.user.avatar'),
      writeAvatar: (avatar) => services.preference.set('app.user.avatar', avatar),
    },
  });

  return {
    backend: {
      agent: services.agent,
      chat: services.chat,
      file: {
        createInternalEntry: services.fileContent.createInternalEntry,
        delete: services.fileContent.delete,
        getUri: services.fileContent.getUri,
      },
      mcp: services.mcpRuntime,
      models,
      paintings,
      permissions,
      profile,
      providers,
      webSearch: services.webSearch,
    },
    dataApiDependencies: {
      mcpServerMutations,
    },
  };
}

function providerConfiguration(provider: {
  defaultChatEndpoint?: NonNullable<
    Parameters<BackendServices['model']['createFromRegistry']>[1]
  >['defaultChatEndpoint'];
  presetProviderId?: NonNullable<
    Parameters<BackendServices['model']['createFromRegistry']>[1]
  >['presetProviderId'];
}) {
  return {
    defaultChatEndpoint: provider.defaultChatEndpoint,
    presetProviderId: provider.presetProviderId,
  };
}
