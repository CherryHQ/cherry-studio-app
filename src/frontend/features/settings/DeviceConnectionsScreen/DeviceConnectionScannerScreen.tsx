import { Button, ContentState, Input, useToast } from '@cherrystudio/ui/components';
import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';
import { useBackendModule } from '@/frontend/data';
import { useDesktopConnectionActions } from '@/frontend/hooks/useDesktopConnections';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import { canRequestDevicePermission } from '@/shared/contracts';
import {
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';
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
  const [manualValue, setManualValue] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const scanInFlight = useRef(false);
  const mounted = useRef(false);
  const { isPairing, pair } = useDesktopConnectionActions();
  const isReady = isActive && !isPreparing;
  const showCamera = !isPreparing && !scanError && camera?.state === 'granted';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    async (qr: DesktopPairingQr) => {
      try {
        const connection = await pair({ ...qr, ...(connectionId ? { connectionId } : {}) });
        if (!mounted.current) return;
        if (!connection) {
          scanInFlight.current = false;
          setHasScanned(false);
          return;
        }
        // Pairing succeeded, so the sync screen is the next decision. It reports a device that
        // stopped being usable between here and there, which is the only state a separate
        // confirmation step used to add.
        router.replace({
          params: { connectionId: connection.id },
          pathname:
            setupIntent === 'chat'
              ? '/onboarding/provider-sync'
              : '/settings/provider/desktop-sync',
        });
      } catch (error) {
        if (mounted.current) setScanError(desktopConnectionErrorMessage(error, t));
      }
    },
    [connectionId, pair, router, setupIntent, t],
  );

  const parseAndSubmit = useCallback(
    (value: string) => {
      if (!canSubmit() || scanInFlight.current) return;
      // Native scan events and manual submits can arrive before React commits loading state.
      // Keep this latch closed through errors; only an explicit retry can re-arm the scanner.
      scanInFlight.current = true;
      setHasScanned(true);
      try {
        const parsed = DesktopPairingQrSchema.safeParse(JSON.parse(value));
        if (!parsed.success) {
          throw new Error('invalid QR');
        }
        void submit(parsed.data);
      } catch {
        setScanError(t('settings.deviceConnections.scan.invalidQr'));
      }
    },
    [canSubmit, submit, t],
  );

  return (
    <View className="flex-1 bg-grouped-background">
      <RouteHeader title={t('settings.deviceConnections.scan.title')} />
      <View className="px-4 pt-3 pb-4">
        <Text className="text-sm text-muted-foreground">
          {t('settings.deviceConnections.scan.guidance')}
        </Text>
      </View>
      <View
        className={
          showCamera
            ? 'min-h-0 flex-1 overflow-hidden bg-black'
            : 'min-h-0 flex-1 overflow-hidden bg-grouped-background'
        }
      >
        {isPreparing ? (
          <ContentState.Loading title={t('settings.deviceConnections.scan.loadingCamera')} />
        ) : scanError ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: retryScan }}
              title={scanError}
            />
          </View>
        ) : camera?.state === 'granted' ? (
          <>
            <CameraView
              active={isReady && !hasScanned && !isPairing}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                !isReady || hasScanned || isPairing
                  ? undefined
                  : ({ data }) => {
                      parseAndSubmit(data);
                    }
              }
              style={StyleSheet.absoluteFill}
            />
            <View className="flex-1 items-center justify-center" pointerEvents="none">
              <View className="size-56 rounded-3xl border-2 border-white" />
            </View>
          </>
        ) : (
          <View className="flex-1 justify-center px-6">
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
          </View>
        )}
      </View>
      <View className="gap-3 border-border border-t bg-grouped-background px-4 py-5">
        <Text className="text-sm text-muted-foreground">
          {t('settings.deviceConnections.scan.manualDescription')}
        </Text>
        <Input
          accessibilityLabel={t('settings.deviceConnections.scan.manualEntry')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={isReady && !hasScanned}
          multiline
          onChangeText={setManualValue}
          onSubmitEditing={() => {
            const value = manualValue.trim();
            if (value) {
              parseAndSubmit(value);
            }
          }}
          placeholder={t('settings.deviceConnections.scan.manualPlaceholder')}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          value={manualValue}
        />
        <Button
          disabled={!isReady || hasScanned || !manualValue.trim()}
          loading={isPairing}
          onPress={() => parseAndSubmit(manualValue.trim())}
        >
          {t('settings.deviceConnections.scan.pair')}
        </Button>
      </View>
    </View>
  );
}
