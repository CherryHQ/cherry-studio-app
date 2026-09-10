import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import { createOfficialMcpClient } from '../createOfficialMcpClient';
import type { PluginDefinition } from '../pluginDefinition';

const AmapCredentialSchema = z.object({ version: z.literal(1), key: z.string().min(1).max(4096) });

export const amapPlugin: PluginDefinition = {
  serverName: '高德地图',
  catalog: {
    id: 'amap',
    icon: 'map-pin',
    links: {
      credentials: 'https://console.amap.com/dev/key/app',
      website: 'https://lbs.amap.com',
      privacy: 'https://lbs.amap.com/pages/privacy/',
    },
  },
  tools: {
    maps_text_search: 'read',
    maps_around_search: 'read',
    maps_geo: 'read',
    maps_regeocode: 'read',
    maps_direction_driving: 'read',
    maps_direction_walking: 'read',
    maps_direction_transit_integrated: 'read',
    maps_weather: 'read',
  },
  authMethods: [
    {
      id: 'api_key',
      kind: 'credentials',
      fields: [{ id: 'key', secret: true, maxLength: 4096, pattern: '^\\S+$' }],
      encodeCredentials: (fields) => ({ version: 1, key: fields.key }),
      createRequestAuthorization: () => ({
        apply(credential, { url }) {
          const parsed = AmapCredentialSchema.safeParse(credential);
          if (!parsed.success)
            throw new PluginError('authorization', 'The Amap credential is invalid.');
          const { key } = parsed.data;
          url.searchParams.set('key', key);
        },
      }),
    },
  ],
  createClient(context) {
    return createOfficialMcpClient(context, {
      url: 'https://mcp.amap.com/mcp',
    });
  },
  validation: {
    tool: 'maps_weather',
    args: { city: '110000' },
    accountLabel(result) {
      z.object({ forecasts: z.array(z.unknown()).min(1) }).parse(result);
      return 'Web Service';
    },
  },
};
