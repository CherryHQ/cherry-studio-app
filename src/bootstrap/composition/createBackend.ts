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
import { CherryInClient } from '@/backend/services/cherryin/CherryInClient';
import { createMcpModule, type McpServerMutations } from '@/backend/services/mcp/createMcpModule';
import { createModelsModule } from '@/backend/services/models/createModelsModule';
import { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import { ProviderAuthConfigOAuthTokenStore } from '@/backend/services/oauth/runtime/OAuthTokenStore';
import { createPaintingsModule } from '@/backend/services/paintings/createPaintingsModule';
import { createPermissionsModule } from '@/backend/services/permissions/createPermissionsModule';
import { createProfileModule } from '@/backend/services/profile/createProfileModule';
import {
  replaceUserAvatar,
  resolveUserAvatarUri,
} from '@/backend/services/profile/userAvatarStorage';
import { createProvidersModule } from '@/backend/services/providers/createProvidersModule';
import {
  getProviderAvatarUri,
  saveProviderAvatar,
} from '@/backend/services/providers/providerAvatarStorage';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';
import type { Backend } from '@/shared/contracts';

export type BackendComposition = {
  backend: Backend;
  dataApiDependencies: {
    mcpServerMutations: McpServerMutations;
  };
  dispose(): Promise<void>;
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
  const cherryin = new CherryInClient({
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
    ai: services.ai,
    files: services.fileEntry,
    paintings: services.painting,
    storage: {
      discard: discardPreparedFiles,
      prepareGeneratedImage,
      prepareInput: prepareInternalFileFromUri,
      readDataUrl: imageUriToDataUrl,
    },
  });
  const mcp = createMcpModule({
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
      remove: (id) => services.mcpServer.delete(id, 'streamableHttp'),
      update: (id, input) => services.mcpServer.update(id, input, 'streamableHttp'),
    },
  });
  const providers = createProvidersModule({
    avatars: {
      persist: saveProviderAvatar,
      resolve: getProviderAvatarUri,
    },
    canRemove: canDeleteProvider,
  });
  const permissions = createPermissionsModule({
    device: {
      getStatus: (key) => services.devicePermissions.getStatusForPreference(key),
      openSystemSettings: (permission) => services.devicePermissions.openSystemSettings(permission),
      request: (key) => services.devicePermissions.requestForPreference(key),
    },
    preferences: {
      readCached: (key) => services.preference.readCached(key),
      set: (key, value) => services.preference.set(key, value),
    },
  });
  const profile = createProfileModule({
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
      mcpServerMutations: mcp,
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
