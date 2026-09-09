import { Button, ContentState, Input, useAlert, useToast } from '@cherrystudio/ui/components';
import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { useDesktopConnectionActions } from '@/frontend/hooks/useDesktopConnections';
import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import { canRequestDevicePermission } from '@/shared/contracts';
import {
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';

const CAMERA_PERMISSION_SCOPES = ['camera.read'] as const;

export function DeviceConnectionScannerScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const { refresh, statuses } = useDevicePermissionStatuses(CAMERA_PERMISSION_SCOPES);
  const permission = statuses['camera.read'];
  const hasRequestedPermission = useRef(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const scanInFlight = useRef(false);
  const { isPairing, pair } = useDesktopConnectionActions();

  const requestCameraPermission = useCallback(async () => {
    setIsRequestingPermission(true);
    try {
      await permissions.request(CAMERA_PERMISSION_SCOPES);
      await refresh();
    } catch {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    } finally {
      setIsRequestingPermission(false);
    }
  }, [permissions, refresh, t, toast]);

  useEffect(() => {
    if (
      permission?.state === 'undetermined' &&
      canRequestDevicePermission(permission) &&
      !hasRequestedPermission.current
    ) {
      hasRequestedPermission.current = true;
      void requestCameraPermission();
    }
  }, [permission, requestCameraPermission]);

  const submit = useCallback(
    async (qr: DesktopPairingQr) => {
      try {
        const connection = await pair({ ...qr, ...(connectionId ? { connectionId } : {}) });
        if (!connection) return;
        toast.show({
          label: t('settings.deviceConnections.scan.connected', { name: connection.name }),
          variant: 'success',
        });
        router.dismissTo('/settings/device-connections');
      } catch (error) {
        scanInFlight.current = false;
        alert.show({ title: desktopConnectionErrorMessage(error, t) });
        setHasScanned(false);
      }
    },
    [alert, connectionId, pair, router, t, toast],
  );

  const parseAndSubmit = useCallback(
    (value: string) => {
      if (scanInFlight.current) return;
      scanInFlight.current = true;
      try {
        const parsed = DesktopPairingQrSchema.safeParse(JSON.parse(value));
        if (!parsed.success) {
          throw new Error('invalid QR');
        }
        setHasScanned(true);
        void submit(parsed.data);
      } catch {
        scanInFlight.current = false;
        alert.show({ title: t('settings.deviceConnections.scan.invalidQr') });
        setHasScanned(false);
      }
    },
    [alert, submit, t],
  );

  return (
    <View className="flex-1 bg-grouped-background">
      <RouteHeader title={t('settings.deviceConnections.scan.title')} />
      <View className="min-h-0 flex-1 overflow-hidden bg-black">
        {!permission || isRequestingPermission ? (
          <ContentState.Loading title={t('settings.deviceConnections.scan.loadingCamera')} />
        ) : permission.state === 'granted' ? (
          <>
            <CameraView
              active={!isPairing}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                hasScanned || isPairing
                  ? undefined
                  : ({ data }) => {
                      setHasScanned(true);
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
                canRequestDevicePermission(permission)
                  ? {
                      children: t('settings.deviceConnections.scan.allowCamera'),
                      onPress: () => void requestCameraPermission(),
                    }
                  : permission.state === 'denied'
                    ? {
                        children: t('settings.permissions.openSystemSettings'),
                        onPress: () =>
                          void permissions.openSystemSettings('camera').catch(() => {
                            toast.show({
                              label: t('settings.permissions.actionFailed'),
                              variant: 'danger',
                            });
                          }),
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
          disabled={!manualValue.trim()}
          loading={isPairing}
          onPress={() => parseAndSubmit(manualValue.trim())}
        >
          {t('settings.deviceConnections.scan.pair')}
        </Button>
      </View>
    </View>
  );
}
