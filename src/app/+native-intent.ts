import { routeAccountCallback } from '@/frontend/appShell/account/nativeIntent';
import { redirectCloudAmdSystemPath } from '@/frontend/appShell/cloud/nativeIntent';
import { redirectSystemPath as redirectUuRemoteSystemPath } from '@/frontend/appShell/uuRemote/nativeIntent';

export function redirectSystemPath(intent: Parameters<typeof redirectUuRemoteSystemPath>[0]) {
  const destination = redirectCloudAmdSystemPath(intent);
  return routeAccountCallback(
    intent.path,
    destination === undefined ? redirectUuRemoteSystemPath(intent) : destination,
  );
}
