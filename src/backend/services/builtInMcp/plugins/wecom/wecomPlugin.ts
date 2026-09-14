import * as z from 'zod';

import type { PluginDefinition } from '../../pluginDefinition';
import { createWecomClient } from './createWecomClient';
import { wecomGuide } from './guide';
import { WecomAuthorizationRuntime } from './WecomAuthorizationRuntime';
import { parseWecomResponse } from './wecomBotApi';
import { WECOM_TOOL_POLICY } from './wecomTools';

export const wecomPlugin: PluginDefinition = {
  serverName: '企业微信',
  guide: wecomGuide,
  catalog: {
    id: 'wecom',
    icon: 'file-text',
    links: {
      website: 'https://work.weixin.qq.com',
      privacy: 'https://work.weixin.qq.com/nl/privacy',
    },
  },
  tools: WECOM_TOOL_POLICY,
  authMethods: [
    {
      id: 'wecom_bot',
      kind: 'interactive',
      interaction: 'polling',
      stages: ['bot'],
      createRuntime: (store) => new WecomAuthorizationRuntime(store),
      // The local bot client binds credentials to the official CLI gateway.
      createRequestAuthorization: () => ({ apply() {} }),
    },
  ],
  createClient: createWecomClient,
  // The public tool directory is not proof that a credential works. Read the session identity.
  validation: {
    tool: 'wecom_identity_whoami',
    args: {},
    accountLabel(output) {
      parseWecomResponse(z.object({ extra_identity_context: z.string().trim().min(1) }), output);
      return 'WeCom';
    },
  },
};
