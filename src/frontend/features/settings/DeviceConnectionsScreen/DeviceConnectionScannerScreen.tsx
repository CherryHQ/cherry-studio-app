import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';
import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { canRequestDevicePermission } from '@/shared/contracts';

import { useDesktopPairingInput } from './DesktopPairingProvider';
import { pairingCancelDestination } from './pairingCancelDestination';
import { usePairingInvitationInput } from './usePairingInvitationInput';
import { useScannerPermissions } from './useScannerPermissions';

export function DeviceConnectionScannerScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const { camera, isPreparing, isActive, canSubmit, prepare } = useScannerPermissions();
  const insets = useSafeAreaInsets();
  const { setInput } = useDesktopPairingInput();
  const { submitted, scanInvalid, scan, paste, retryScan } = usePairingInvitationInput({
    canSubmit,
    onInvitation: (invitation) => {
      setInput({
        ...invitation,
        capabilities: ['configuration', 'agent'],
        ...(connectionId ? { connectionId } : {}),
      });
      router.replace(
        setupIntent === 'chat'
          ? '/onboarding/device-connections/pair'
          : '/settings/device-connections/pair',
      );
    },
    onInvalidPaste: () =>
      toast.show({
        label: t('settings.deviceConnections.scan.invalidInvitation'),
        variant: 'danger',
      }),
  });
  const isReady = isActive && !isPreparing;
  const showCamera = !isPreparing && !scanInvalid && camera?.state === 'granted';

  const cancel = () => router.replace(pairingCancelDestination(setupIntent, connectionId));

  const openSystemSettings = () => {
    void permissions.openSystemSettings().catch(() => {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    });
  };

  return (
    <View className="flex-1 bg-grouped-background">
      <RouteHeader
        onBack={cancel}
        title={t(
          connectionId
            ? 'settings.deviceConnections.location.scan'
            : 'settings.deviceConnections.scan.title',
        )}
      />
      <ScrollView
        contentContainerClassName="gap-5 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
      >
        <View
          className={
            showCamera
              ? 'aspect-square w-full overflow-hidden rounded-3xl bg-black'
              : 'aspect-square w-full justify-center overflow-hidden rounded-3xl bg-card px-6'
          }
          style={styles.viewport}
        >
          {isPreparing ? (
            <ContentState.Loading title={t('settings.deviceConnections.scan.loadingCamera')} />
          ) : scanInvalid ? (
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: retryScan }}
              title={t('settings.deviceConnections.scan.invalidQr')}
            />
          ) : camera?.state === 'granted' ? (
            <>
              <CameraView
                active={isReady && !submitted}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  !isReady || submitted
                    ? undefined
                    : ({ data }) => {
                        scan(data);
                      }
                }
                style={StyleSheet.absoluteFill}
              />
              <View className="flex-1 items-center justify-center" pointerEvents="none">
                <View className="aspect-square w-2/3">
                  <View className="absolute top-0 left-0 size-10 rounded-tl-3xl border-white border-t-4 border-l-4" />
                  <View className="absolute top-0 right-0 size-10 rounded-tr-3xl border-white border-t-4 border-r-4" />
                  <View className="absolute bottom-0 left-0 size-10 rounded-bl-3xl border-white border-b-4 border-l-4" />
                  <View className="absolute right-0 bottom-0 size-10 rounded-br-3xl border-white border-r-4 border-b-4" />
                </View>
              </View>
            </>
          ) : (
            <ContentState.Empty
              description={t('settings.deviceConnections.scan.permissionDescription')}
              primaryAction={
                canRequestDevicePermission(camera) || camera?.state === 'error'
                  ? {
                      children: t('settings.deviceConnections.scan.allowCamera'),
                      onPress: () => void prepare(true),
                    }
                  : camera?.state === 'denied'
                    ? {
                        children: t('settings.permissions.openSystemSettings'),
                        onPress: openSystemSettings,
                      }
                    : undefined
              }
              title={t('settings.deviceConnections.scan.permissionTitle')}
            />
          )}
        </View>
        <Text className="px-6 text-center text-sm text-muted-foreground">
          {t(
            connectionId
              ? 'settings.deviceConnections.location.scanHelp'
              : 'settings.deviceConnections.scan.guidance',
          )}
        </Text>
        <Button
          disabled={!isReady || submitted}
          onPress={() => void paste()}
          testID="desktop-pairing-paste"
          variant="secondary"
        >
          {t('settings.deviceConnections.scan.pasteInvitation')}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    borderCurve: 'continuous',
  },
});
