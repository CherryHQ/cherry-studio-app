import type { CherryUIMessage } from '@cherrystudio/universal/data/types/message';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { readUIMessageStream, type UIMessageChunk } from 'ai';

import { ChatRuntime } from '@/backend/ai/streamManager/ChatRuntime';
import {
  discardPreparedFiles,
  imageUriToDataUrl,
  prepareGeneratedImage,
  prepareInternalFileFromUri,
  prepareMessageParts,
} from '@/backend/data/services/fileStorage';
import { materializeRemoteModels } from '@/backend/data/services/materializeRemoteModels';
import { canDeleteProvider } from '@/backend/data/services/ProviderService';
import { CherryInService } from '@/backend/services/cherryin/CherryInService';
import { McpService } from '@/backend/services/mcp/McpService';
import { ModelsService } from '@/backend/services/models/ModelsService';
import { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { ProviderAuthConfigOAuthTokenStore } from '@/backend/services/oauth/runtime/OAuthTokenStore';
import { PaintingsService } from '@/backend/services/paintings/PaintingsService';
import { PermissionsService } from '@/backend/services/permissions/PermissionsService';
import { ProfileService } from '@/backend/services/profile/ProfileService';
import {
  replaceUserAvatar,
  resolveUserAvatarUri,
} from '@/backend/services/profile/userAvatarStorage';
import {
  getProviderAvatarUri,
  saveProviderAvatar,
} from '@/backend/services/providers/providerAvatarStorage';
import { ProvidersService } from '@/backend/services/providers/ProvidersService';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import type { Backend } from '@/shared/contracts';

export type BackendComposition = {
  backend: Backend;
  dataApiDependencies: {
    mcpServers: McpService;
    models: ModelsService;
    paintings: PaintingsService;
    providers: ProvidersService;
  };
  dispose(): void;
};

export function createBackend(services: BackendServices): BackendComposition {
  const oauth = new OAuthRuntimeService({
    providers: {
      listApiKeys: (providerId) => services.provider.listApiKeys(providerId),
      replaceApiKeys: (providerId, keys) => services.provider.replaceApiKeys(providerId, keys),
      update: (providerId, input) => services.provider.update(providerId, input),
    },
    tokenStore: new ProviderAuthConfigOAuthTokenStore({
      getAuthConfig: (providerId) => services.provider.getAuthConfig(providerId),
      update: (providerId, input) => services.provider.update(providerId, input),
    }),
  });
  const cherryin = new CherryInService({
    oauth: {
      authenticatedFetch: (providerId, buildRequest, doFetch, options) =>
        oauth.authenticatedFetch(providerId, buildRequest, doFetch, options),
      hasToken: (providerId) => oauth.hasToken(providerId),
    },
  });
  const chat = new ChatRuntime({
    files: {
      discard: discardPreparedFiles,
      prepareParts: prepareMessageParts,
    },
    services: {
      ai: {
        generateText: (input) => services.ai.generateText(input),
        readMessageStream: ({ message, stream }) =>
          readUIMessageStream<CherryUIMessage>({
            message,
            stream: stream as ReadableStream<UIMessageChunk>,
            terminateOnError: true,
          }),
        streamText: (input) => services.ai.streamText(input),
      },
      assistant: services.assistant,
      message: services.message,
      model: services.model,
      preference: services.preference,
      provider: services.provider,
      topic: services.topic,
    },
  });
  const models = new ModelsService({
    ai: services.ai,
    materializeRemoteModels,
    models: {
      add: (input, provider) =>
        services.model.createFromRegistry(input, providerConfiguration(provider)),
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
      remove: (id) => services.model.delete(id),
    },
    providers: {
      get: (id) => services.provider.getByProviderId(id),
      update: (id, input) => services.provider.update(id, input),
    },
  });
  const paintings = new PaintingsService({
    ai: services.ai,
    files: services.fileEntry,
    paintings: {
      create: (input) => services.painting.create(input),
      get: (id) => services.painting.getById(id),
      listIds: () => services.painting.listAllIds(),
      listPage: (query) => services.painting.listByCursor(query),
      removeMany: (ids) => services.painting.deleteMany(ids),
      replaceOutputs: (id, outputs) => services.painting.replaceOutputs(id, outputs),
    },
    storage: {
      discard: discardPreparedFiles,
      prepareGeneratedImage,
      prepareInput: prepareInternalFileFromUri,
      readDataUrl: imageUriToDataUrl,
    },
  });
  const mcp = new McpService({
    runtime: {
      getRuntimeSummaries: (servers) => services.mcpRuntime.getRuntimeSummaries(servers),
      getServerInfo: (config) => services.mcpRuntime.getServerInfo(config),
      invalidate: (id, options) => services.mcpRuntime.invalidateServer(id, options),
      listTools: (server) => services.mcpRuntime.listToolsForServer(server),
      test: (config) => services.mcpRuntime.testConnection(config),
      warm: (server) => services.mcpRuntime.warmToolsCache(server),
    },
    servers: {
      create: (input) => services.mcpServer.create(input, 'streamableHttp'),
      get: (id) => services.mcpServer.getById(id, 'streamableHttp'),
      list: (query) => services.mcpServer.list({ ...query, type: 'streamableHttp' }),
      remove: (id) => services.mcpServer.delete(id, 'streamableHttp'),
      update: (id, input) => services.mcpServer.update(id, input, 'streamableHttp'),
    },
  });
  const providers = new ProvidersService({
    avatars: {
      persist: saveProviderAvatar,
      resolve: getProviderAvatarUri,
    },
    providers: {
      canRemove: canDeleteProvider,
      create: (input) => services.provider.create(input),
      get: (id) => services.provider.getByProviderId(id),
      getAuth: (id) => services.provider.getAuthConfig(id),
      list: (query) => services.provider.list(query),
      listApiKeys: async (id, query) => (await services.provider.listApiKeys(id, query)).keys,
      remove: (id) => services.provider.delete(id),
      replaceApiKeys: (id, keys) => services.provider.replaceApiKeys(id, keys),
      update: (id, input) => services.provider.update(id, input),
      updateApiKey: (id, keyId, input) => services.provider.updateApiKey(id, keyId, input),
    },
  });
  const permissions = new PermissionsService({
    device: {
      getStatus: (key) => services.devicePermission.getStatusForPreference(key),
      openSystemSettings: (permission) => services.devicePermission.openSystemSettings(permission),
      request: (key) => services.devicePermission.requestForPreference(key),
    },
    preferences: {
      readCached: (key) => services.preference.readCached(key),
      set: (key, value) => services.preference.set(key, value),
    },
  });
  const profile = new ProfileService({
    avatars: {
      replace: replaceUserAvatar,
      resolve: resolveUserAvatarUri,
    },
    preferences: {
      readAvatar: () => services.preference.readCached('app.user.avatar'),
      writeAvatar: (avatar) => services.preference.set('app.user.avatar', avatar),
    },
  });

  return {
    backend: {
      chat,
      cherryin,
      mcp,
      models,
      oauth,
      paintings,
      permissions,
      profile,
      providers,
      webSearch: services.webSearch,
    },
    dataApiDependencies: {
      mcpServers: mcp,
      models,
      paintings,
      providers,
    },
    dispose: () => chat.dispose(),
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
