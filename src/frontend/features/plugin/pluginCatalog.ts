import type { PluginId } from '@/shared/contracts/plugins';

export const PLUGIN_IDS: readonly PluginId[] = ['github', 'amap'];

/**
 * GitHub pre-fills the fine-grained token form from these query parameters:
 * name, expiry, and the permissions the bundled tools use. Repository selection
 * cannot be pre-filled, so the user still picks repositories on the page.
 */
const GITHUB_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new' +
  '?name=Cherry%20Studio&description=Cherry%20Studio%20plugin&expires_in=366' +
  '&contents=read&issues=write&pull_requests=write';

export const PLUGIN_LINKS = {
  github: {
    credentials: GITHUB_TOKEN_URL,
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
