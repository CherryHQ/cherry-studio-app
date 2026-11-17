import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { OnboardingDesktopSyncScreen } from '@/frontend/features/onboarding/deviceConnections';
import { desktopConnectionErrorMessage } from '@/frontend/features/settings/DeviceConnectionsScreen';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export default function OnboardingProviderSyncRoute() {
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const { t } = useTranslation();
  return (
    <OnboardingDesktopSyncScreen
      connectionId={connectionId}
      errorMessage={(error) => desktopConnectionErrorMessage(error, t, { detail: 'summary' })}
      key={connectionId ?? 'choose-device'}
    />
  );
}
