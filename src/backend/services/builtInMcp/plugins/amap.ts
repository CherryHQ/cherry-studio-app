import * as z from 'zod';

import { createOfficialMcpClient } from '../createOfficialMcpClient';
import type { PluginDefinition } from '../pluginDefinition';

export const amapPlugin: PluginDefinition = {
  serverName: '高德地图',
  catalog: {
    id: 'amap',
    name: {
      default: 'Amap',
      'zh-cn': '高德地图',
    },
    summary: {
      default: 'Find places, plan routes, and check weather',
      'zh-cn': '搜索地点，规划路线，查询天气',
    },
    description: {
      default:
        "Use Amap's official cloud tools to find places nearby, convert addresses and coordinates, plan driving, walking and transit routes, and check weather forecasts. Standalone administrative district lookup is not included.",
      'zh-cn':
        '通过高德官方云端工具搜索地点与周边、转换地址与坐标、规划驾车/步行/公交路线，查询天气预报。不包含独立的行政区查询。',
    },
    access: {
      default:
        "Uses the service access and quota associated with your Amap key. Addresses, search terms, and route endpoints are sent to Amap's official MCP service. This plugin does not automatically access device location.",
      'zh-cn':
        '使用你的高德 Key 对应的服务权限和配额。你提供的地址、搜索词和路线起终点会发送到高德官方 MCP 服务；本插件不会自动读取设备定位。',
    },
    setup: {
      default:
        "Create an application on Amap Open Platform and add a Web Service key for its official cloud MCP service. Follow Amap's MCP key requirements and ensure the key has available quota.",
      'zh-cn':
        '在高德开放平台创建应用并添加“Web服务”类型的 Key，用于连接官方云端 MCP。请按高德 MCP 的要求配置 Key，并确认配额可用。',
    },
    credentialLinkLabel: {
      default: 'Get a key on Amap Open Platform',
      'zh-cn': '在高德开放平台获取 Key',
    },
    icon: 'map-pin',
    links: {
      credentials: 'https://console.amap.com/dev/key/app',
      website: 'https://lbs.amap.com',
      privacy: 'https://lbs.amap.com/pages/privacy/',
    },
    credentialFields: [
      {
        id: 'key',
        label: {
          default: 'Web Service key',
          'zh-cn': 'Web 服务 Key',
        },
        error: {
          default: 'Enter a complete credential without spaces or line breaks',
          'zh-cn': '请输入完整的密钥，不要包含空格或换行',
        },
        secret: true,
        maxLength: 4096,
        pattern: '^\\S+$',
      },
    ],
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
  authMethod: 'api_key',
  encodeCredentials: (fields) => fields.key,
  createClient(context) {
    return createOfficialMcpClient(context, {
      url: 'https://mcp.amap.com/mcp',
      authorization: {
        apply(credential, { url }) {
          url.searchParams.set('key', credential);
        },
      },
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
