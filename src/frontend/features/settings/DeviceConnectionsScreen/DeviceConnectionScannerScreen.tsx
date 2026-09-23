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
  type DesktopPairingClaim,
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';
import { useScannerPermissions } from './useScannerPermissions';

export function DeviceConnectionScannerScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
  const params = useLocalSearchParams<{ connectionId?: string | string[]; purpose?: string }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const updatingLocation = params.purpose === 'location' && Boolean(connectionId);
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const { camera, isPreparing, isActive, canSubmit, prepare } = useScannerPermissions();
  const [manualValue, setManualValue] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const [claim, setClaim] = useState<DesktopPairingClaim>();
  const scanInFlight = useRef(false);
  const mounted = useRef(false);
  const { isPairing, pair, updateLocation } = useDesktopConnectionActions();
  const isReady = isActive && !isPreparing;
  const showCamera = !isPreparing && !scanError && !claim && camera?.state === 'granted';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retryScan = () => {
    scanInFlight.current = false;
    setScanError(undefined);
    setClaim(undefined);
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
        if (updatingLocation && connectionId) {
          const updated = await updateLocation(connectionId, qr);
          if (updated && mounted.current)
            router.replace({
              params: { connectionId },
              pathname: '/settings/device-connections/[connectionId]',
            });
          return;
        }
        // The desktop user decides which of the requested capabilities this device gets.
        const connection = await pair(
          {
            ...qr,
            capabilities: ['configuration', 'agent'],
            ...(connectionId ? { connectionId } : {}),
          },
          (nextClaim) => {
            if (mounted.current) setClaim(nextClaim);
          },
        );
        if (!mounted.current) return;
        if (!connection) {
          scanInFlight.current = false;
          setClaim(undefined);
          setHasScanned(false);
          return;
        }
        // Provider sync is the next decision when it was granted; otherwise show what was.
        if (connection.capabilities.includes('configuration')) {
          router.replace({
            params: { connectionId: connection.id },
            pathname:
              setupIntent === 'chat'
                ? '/onboarding/provider-sync'
                : '/settings/provider/desktop-sync',
          });
        } else if (setupIntent === 'chat') {
          router.dismissTo('/onboarding');
        } else {
          router.replace({
            params: { connectionId: connection.id },
            pathname: '/settings/device-connections/[connectionId]',
          });
        }
      } catch (error) {
        if (mounted.current) {
          setClaim(undefined);
          setScanError(desktopConnectionErrorMessage(error, t));
        }
      }
    },
    [connectionId, pair, router, setupIntent, t, updatingLocation, updateLocation],
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
      <RouteHeader
        title={t(
          updatingLocation
            ? 'settings.deviceConnections.location.scan'
            : 'settings.deviceConnections.scan.title',
        )}
      />
      <View className="px-4 pt-3 pb-4">
        <Text className="text-sm text-muted-foreground">
          {t(
            updatingLocation
              ? 'settings.deviceConnections.location.scanHelp'
              : 'settings.deviceConnections.scan.guidance',
          )}
        </Text>
      </View>
      <View
        className={
          showCamera
            ? 'min-h-0 flex-1 overflow-hidden bg-black'
            : 'min-h-0 flex-1 overflow-hidden bg-grouped-background'
        }
      >
        {claim ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Text className="text-center text-sm text-muted-foreground">
              {t('settings.deviceConnections.scan.approveOnDesktop')}
            </Text>
            <Text
              accessibilityLabel={t('settings.deviceConnections.scan.verificationCode')}
              className="font-mono text-4xl tracking-[0.3em] text-foreground"
            >
              {claim.verificationCode}
            </Text>
            <ContentState.Loading title={t('settings.deviceConnections.scan.waiting')} />
          </View>
        ) : isPreparing ? (
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
          {t(
            updatingLocation
              ? 'settings.deviceConnections.location.scan'
              : 'settings.deviceConnections.scan.pair',
          )}
        </Button>
      </View>
    </View>
  );
}
