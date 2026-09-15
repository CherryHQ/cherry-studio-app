import { PluginError } from '@/shared/contracts/plugins';

import type { PluginDefinition, PluginRequestAuthorization } from '../../pluginDefinition';
import { createWecomClient } from './createWecomClient';
import { wecomGuide } from './guide';
import { WecomAuthorizationRuntime } from './WecomAuthorizationRuntime';
import { readWecomCredential } from './wecomCredentials';
import { isWecomApiUrl } from './wecomSchema';
import { acceptsWecomTool, WECOM_TOOL_POLICY } from './wecomTools';

const authorization: PluginRequestAuthorization = {
  apply(value, { url, headers }) {
    const credential = readWecomCredential(value);
    if (!isWecomApiUrl(url)) throw new PluginError('access', 'Untrusted Wecom service endpoint.');
    headers.set('Authorization', `Bearer ${credential.token}`);
  },
};

export const wecomPlugin: PluginDefinition = {
  serverName: '企业微信',
  guide: wecomGuide,
  catalog: {
    id: 'wecom',
    icon: 'file-text',
    links: {
      credentials: 'https://open.work.weixin.qq.com/help2/pc/cat?doc_id=21677',
      website: 'https://work.weixin.qq.com',
      privacy: 'https://work.weixin.qq.com/nl/privacy',
    },
  },
  tools: WECOM_TOOL_POLICY,
  acceptsDiscoveredTool: acceptsWecomTool,
  authMethods: [
    {
      id: 'wecom_bot',
      kind: 'interactive',
      interaction: 'polling',
      stages: ['bot'],
      createRuntime: (store) => new WecomAuthorizationRuntime(store),
      createRequestAuthorization: () => authorization,
    },
  ],
  createClient: createWecomClient,
  // Authorization exchanges a token; setup only discovers tools, without business calls.
  validation: {
    accountLabel: () => 'WeCom',
  },
};
