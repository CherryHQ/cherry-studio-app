import { Redirect, useLocalSearchParams } from 'expo-router';

import {
  readProviderSetupReturnTo,
  type ProviderSetupRouteParamsInput,
} from '@/frontend/appShell/navigation';

export default function ProviderModelPullScreen() {
  const {
    providerId,
    providerName,
    returnTo: rawReturnTo,
  } = useLocalSearchParams<
    ProviderSetupRouteParamsInput & {
      providerId?: string;
      providerName?: string;
    }
  >();
  const returnTo = readProviderSetupReturnTo(rawReturnTo);
  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <Redirect
      href={{
        params: {
          mode: 'sync',
          ...(providerName ? { providerName } : {}),
          providerId,
          ...(returnTo ? { returnTo } : {}),
        },
        pathname: '/settings/provider/[providerId]/model-add',
      }}
    />
  );
}
