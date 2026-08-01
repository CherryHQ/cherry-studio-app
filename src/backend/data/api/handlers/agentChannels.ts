import { DataApiErrorFactory, toDataApiError } from '@cherrystudio/universal/data/api/errors';
import {
  ActiveAgentChannelConfigSchemasByType,
  AgentChannelListQuerySchema,
  type AgentChannelSchemas,
  CreateAgentChannelSchema,
  UpdateAgentChannelSchema,
} from '@cherrystudio/universal/data/api/schemas/agentChannels';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { AgentChannelService } from '@/backend/data/services/AgentChannelService';

export function createAgentChannelHandlers(
  service: AgentChannelService,
): HandlersFor<AgentChannelSchemas> {
  return {
    '/agent-channels': {
      GET: async ({ query }) => {
        const parsed = AgentChannelListQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        return service.listChannels(parsed.data);
      },
      POST: async ({ body }) => {
        const parsed = CreateAgentChannelSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        if (parsed.data.isActive !== false) {
          const activeConfig = ActiveAgentChannelConfigSchemasByType[parsed.data.type].safeParse(
            parsed.data.config,
          );
          if (!activeConfig.success) throw toDataApiError(activeConfig.error);
        }
        return service.createChannel(parsed.data);
      },
    },
    '/agent-channels/:channelId': {
      DELETE: async ({ params }) => {
        if (!(await service.deleteChannel(params.channelId))) {
          throw DataApiErrorFactory.notFound('Channel', params.channelId);
        }
      },
      GET: async ({ params }) => {
        const channel = await service.getChannel(params.channelId);
        if (!channel) throw DataApiErrorFactory.notFound('Channel', params.channelId);
        return channel;
      },
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentChannelSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        const channel = await service.updateChannel(params.channelId, parsed.data);
        if (!channel) throw DataApiErrorFactory.notFound('Channel', params.channelId);
        return channel;
      },
    },
  };
}
