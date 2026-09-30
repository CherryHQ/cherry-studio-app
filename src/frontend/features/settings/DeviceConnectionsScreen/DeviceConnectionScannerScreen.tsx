import { ContentState, useToast } from '@cherrystudio/ui/components';
import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';
import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { canRequestDevicePermission } from '@/shared/contracts';
import {
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import { useDesktopPairingInput } from './DesktopPairingProvider';
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
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const scanInFlight = useRef(false);
  const { setInput } = useDesktopPairingInput();
  const isReady = isActive && !isPreparing;
  const showCamera = !isPreparing && !scanError && camera?.state === 'granted';

  const retryScan = () => {
    scanInFlight.current = false;
    setScanError(undefined);
    setHasScanned(false);
  };

  const openSystemSettings = () => {
    void permissions.openSystemSettings().catch(() => {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    });
  };

  const submit = useCallback(
    (qr: DesktopPairingQr) => {
      setInput({
        ...qr,
        capabilities: ['configuration', 'agent'],
        ...(connectionId ? { connectionId } : {}),
      });
      router.replace(
        setupIntent === 'chat'
          ? '/onboarding/device-connections/pair'
          : '/settings/device-connections/pair',
      );
    },
    [connectionId, router, setInput, setupIntent],
  );

  const parseAndSubmit = useCallback(
    (value: string) => {
      if (!canSubmit() || scanInFlight.current) return;
      // Native scan events can arrive before React commits loading state.
      scanInFlight.current = true;
      setHasScanned(true);
      try {
        const parsed = DesktopPairingQrSchema.safeParse(JSON.parse(value));
        if (!parsed.success) {
          throw new Error('invalid QR');
        }
        submit(parsed.data);
      } catch {
        setScanError(t('settings.deviceConnections.scan.invalidQr'));
      }
    },
    [canSubmit, submit, t],
  );

  return (
    <View className="flex-1 bg-grouped-background">
      <RouteHeader
        title={t(
          connectionId
            ? 'settings.deviceConnections.location.scan'
            : 'settings.deviceConnections.scan.title',
        )}
      />
      <View className="flex-1 gap-5 px-4 pt-3" style={{ paddingBottom: insets.bottom + 8 }}>
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
          ) : scanError ? (
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: retryScan }}
              title={scanError}
            />
          ) : camera?.state === 'granted' ? (
            <>
              <CameraView
                active={isReady && !hasScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  !isReady || hasScanned
                    ? undefined
                    : ({ data }) => {
                        parseAndSubmit(data);
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    borderCurve: 'continuous',
  },
});
