import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingPairingScreen } from '@/frontend/features/onboarding/deviceConnections';
import {
  desktopConnectionErrorMessage,
  useDesktopPairing,
  useDesktopPairingInput,
} from '@/frontend/features/settings/DeviceConnectionsScreen';

export default function OnboardingDevicePairingRoute() {
  const { input: pending, setInput } = useDesktopPairingInput();
  const [input] = useState(pending);
  const state = useDesktopPairing(input);
  const { t } = useTranslation();
  const router = useRouter();
  useEffect(() => {
    setInput(null);
  }, [setInput]);
  return (
    <OnboardingPairingScreen
      complete={Boolean(state.connection)}
      error={
        state.error
          ? desktopConnectionErrorMessage(state.error, t, { detail: 'summary' })
          : undefined
      }
      name={input?.name}
      onBack={() => router.replace('/onboarding')}
      onFinish={() =>
        router.replace(
          state.connection?.capabilities.includes('configuration')
            ? {
                pathname: '/onboarding/provider-sync',
                params: { connectionId: state.connection.id },
              }
            : '/onboarding',
        )
      }
      onScanAgain={() =>
        router.replace({
          pathname: '/onboarding/device-connections/scan',
          params: state.repairConnectionId ? { connectionId: state.repairConnectionId } : {},
        })
      }
      progress={state.progress}
    />
  );
}
