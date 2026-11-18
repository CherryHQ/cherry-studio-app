import Constants from 'expo-constants';

import { redirectSystemPath as redirectUuRemoteSystemPath } from '@/frontend/appShell/uuRemote/nativeIntent';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';

export function redirectSystemPath(intent: Parameters<typeof redirectUuRemoteSystemPath>[0]) {
  const configured = Constants.expoConfig?.scheme;
  const schemes = Array.isArray(configured) ? configured : [configured];
  if (schemes.some((scheme) => scheme && intent.path === `${scheme}://navigate/settings/provider`))
    return `/settings/provider/${CLOUD_PROVIDER_ID}`;
  return redirectUuRemoteSystemPath(intent);
}
