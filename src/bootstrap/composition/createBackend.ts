import type { CherryUIMessage } from '@cherrystudio/universal/data/types/message';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { readUIMessageStream } from 'ai';

import { ChatRuntime } from '@/backend/ai/streamManager/ChatRuntime';
import type { McpServerMutations } from '@/backend/data/api/handlers/mcpServers';
import { materializeRemoteModels } from '@/backend/data/services/materializeRemoteModels';
import { canDeleteProvider } from '@/backend/data/services/ProviderService';
import { CherryInClient } from '@/backend/services/cherryin/CherryInClient';
import {
  createInternalEntry,
  createMessageParts,
  discardInternalEntries,
  getInternalFileUri,
  imageUriToDataUrl,
} from '@/backend/services/file/fileStorage';
import { createMcpModule } from '@/backend/services/mcp/createMcpModule';
import { createModelsModule } from '@/backend/services/models/createModelsModule';
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
  const cherryin = new CherryInClient({
    oauth: {
      authenticatedFetch: (providerId, buildRequest, doFetch, options) =>
        services.oauthSession.authenticatedFetch(providerId, buildRequest, doFetch, options),
      hasToken: (providerId) => services.oauthSession.hasToken(providerId),
    },
  });
  const chat = new ChatRuntime({
    files: {
      createParts: (parts) => createMessageParts(services.fileEntry, parts),
      discard: (entries) => discardInternalEntries(services.fileEntry, entries),
    },
    services: {
      ai: {
        generateText: (input) => services.ai.generateText(input),
        readMessageStream: ({ message, stream }) =>
          readUIMessageStream<CherryUIMessage>({
            message,
            stream,
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
    files: services.fileContent,
    paintings: services.painting,
    storage: {
      createInternalEntry: (input) => createInternalEntry(services.fileEntry, input),
      discard: (entries) => discardInternalEntries(services.fileEntry, entries),
      readDataUrl: imageUriToDataUrl,
      getUri: getInternalFileUri,
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
      file: {
        createInternalEntry: services.fileContent.createInternalEntry,
        deleteIfUnreferenced: services.fileContent.deleteIfUnreferenced,
        getUri: services.fileContent.getUri,
      },
      mcp,
      models,
      oauth: services.oauth,
      paintings,
      permissions,
      profile,
      providers,
      webSearch: services.webSearch,
    },
    dataApiDependencies: {
      mcpServerMutations: mcp,
    },
    dispose: async () => {
      services.oauth.dispose();
      services.oauthSession.dispose();
      await chat.dispose();
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
