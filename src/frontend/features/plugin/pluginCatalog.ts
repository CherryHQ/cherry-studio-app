import type { PluginId } from '@/shared/contracts/plugins';

export const PLUGIN_IDS: readonly PluginId[] = ['github', 'amap'];

export const PLUGIN_LINKS = {
  github: {
    credentials: 'https://github.com/settings/personal-access-tokens/new',
    website: 'https://github.com',
    privacy:
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
  },
  amap: {
    credentials: 'https://console.amap.com/dev/key/app',
    website: 'https://lbs.amap.com',
    privacy: 'https://lbs.amap.com/pages/privacy/',
  },
} as const;
