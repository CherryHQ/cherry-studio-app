import { useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { OnboardingScannerScreen } from '@/frontend/features/onboarding/deviceConnections';
import {
  useDesktopPairingInput,
  usePairingInvitationInput,
  useScannerPermissions,
} from '@/frontend/features/settings/DeviceConnectionsScreen';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export default function OnboardingDeviceScannerRoute() {
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const permissionState = useScannerPermissions();
  const { setInput } = useDesktopPairingInput();
  const input = usePairingInvitationInput({
    canSubmit: permissionState.canSubmit,
    onInvitation: (invitation) => {
      setInput({
        ...invitation,
        capabilities: ['configuration', 'agent'],
        ...(connectionId ? { connectionId } : {}),
      });
      router.replace('/onboarding/device-connections/pair');
    },
    onInvalidPaste: () =>
      toast.show({
        label: t('settings.deviceConnections.scan.invalidInvitation'),
        variant: 'danger',
      }),
  });
  return (
    <OnboardingScannerScreen
      camera={permissionState.camera}
      isActive={permissionState.isActive}
      isPreparing={permissionState.isPreparing}
      onBack={() => router.replace('/onboarding')}
      onPaste={() => void input.paste()}
      onRequest={() => void permissionState.prepare(true)}
      onRetry={input.retryScan}
      onScan={input.scan}
      onSettings={() =>
        void permissions
          .openSystemSettings()
          .catch(() =>
            toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' }),
          )
      }
      scanInvalid={input.scanInvalid}
      submitted={input.submitted}
    />
  );
}
