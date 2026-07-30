import { readUIMessageStream, type UIMessageChunk } from 'ai';
import { ChatApplication } from '@/backend/application/chat/ChatApplication';
import { McpApplication } from '@/backend/application/mcp/McpApplication';
import { ModelsApplication } from '@/backend/application/models/ModelsApplication';
import { PaintingsApplication } from '@/backend/application/paintings/PaintingsApplication';
import { PermissionsApplication } from '@/backend/application/permissions/PermissionsApplication';
import { ProfileApplication } from '@/backend/application/profile/ProfileApplication';
import { ProvidersApplication } from '@/backend/application/providers/ProvidersApplication';
import {
  getProviderAvatarUri,
  saveProviderAvatar,
} from '@/backend/infrastructure/integrations/avatars/providerAvatarStorage';
import {
  replaceUserAvatar,
  resolveUserAvatarUri,
} from '@/backend/infrastructure/integrations/avatars/userAvatarStorage';
import { CherryInOauthService } from '@/backend/infrastructure/integrations/cherryin/CherryInOauthService';
import {
  discardPreparedFiles,
  imageUriToDataUrl,
  prepareGeneratedImage,
  prepareInternalFileFromUri,
  prepareMessageParts,
} from '@/backend/infrastructure/services/fileStorage';
import { materializeRemoteModels } from '@/backend/infrastructure/services/materializeRemoteModels';
import { canDeleteProvider } from '@/backend/infrastructure/services/ProviderService';
import type { DataServices } from '@/bootstrap/createDataServices';
import type { MobileBackend } from '@/shared/contracts';
import type { CherryUIMessage } from '@/shared/data/types/message';
import type { UniqueModelId } from '@/shared/data/types/model';

export function createMobileBackend(services: DataServices): MobileBackend {
  const oauth = CherryInOauthService.getInstance(services.provider);
  const chat = new ChatApplication({
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
      topic: services.topic,
    },
  });
  const models = new ModelsApplication({
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
  const paintings = new PaintingsApplication({
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
  const mcp = new McpApplication({
    runtime: {
      getRuntimeSummaries: (servers) => services.mcp.getRuntimeSummaries(servers),
      getServerInfo: (config) => services.mcp.getServerInfo(config),
      invalidate: (id, options) => services.mcp.invalidateServer(id, options),
      listTools: (server) => services.mcp.listToolsForServer(server),
      test: (config) => services.mcp.testConnection(config),
      warm: (server) => services.mcp.warmToolsCache(server),
    },
    servers: {
      create: (input) => services.mcpServer.create(input, 'streamableHttp'),
      get: (id) => services.mcpServer.getById(id, 'streamableHttp'),
      list: (query) => services.mcpServer.list({ ...query, type: 'streamableHttp' }),
      remove: (id) => services.mcpServer.delete(id, 'streamableHttp'),
      update: (id, input) => services.mcpServer.update(id, input, 'streamableHttp'),
    },
  });
  const providers = new ProvidersApplication({
    avatars: {
      persist: saveProviderAvatar,
      resolve: getProviderAvatarUri,
    },
    oauth: {
      complete: (input) => oauth.completeOAuth(input),
      getAccount: (apiHost) => oauth.getBalance(apiHost),
      getNonOAuthApiKeys: (providerId) => oauth.getNonOAuthApiKeys(providerId),
      logout: (apiHost) => oauth.logout(apiHost),
      saveResult: (providerId, apiKeys) => oauth.saveOAuthResult(providerId, apiKeys),
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
  const permissions = new PermissionsApplication({
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
  const profile = new ProfileApplication({
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
    assistants: services.assistant,
    chat,
    files: services.fileEntry,
    mcp,
    models,
    paintings,
    permissions,
    pins: services.pin,
    preferences: services.preference,
    profile,
    providers,
    topics: services.topic,
    webSearch: services.webSearch,
  };
}

function providerConfiguration(provider: {
  defaultChatEndpoint?: NonNullable<
    Parameters<DataServices['model']['createFromRegistry']>[1]
  >['defaultChatEndpoint'];
  endpointConfigs?: NonNullable<
    Parameters<DataServices['model']['createFromRegistry']>[1]
  >['endpointConfigs'];
}) {
  return {
    defaultChatEndpoint: provider.defaultChatEndpoint,
    endpointConfigs: provider.endpointConfigs,
  };
}
