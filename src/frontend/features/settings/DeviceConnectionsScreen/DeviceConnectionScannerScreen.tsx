import { Button, ContentState, Input, useAlert, useToast } from '@cherrystudio/ui/components';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';
import { useDesktopConnectionActions } from '@/frontend/hooks/useDesktopConnections';
import {
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';

export function DeviceConnectionScannerScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualValue, setManualValue] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const { isPairing, pair } = useDesktopConnectionActions();

  const submit = useCallback(
    async (qr: DesktopPairingQr) => {
      try {
        const connection = await pair({ ...qr, ...(connectionId ? { connectionId } : {}) });
        toast.show({
          label: t('settings.deviceConnections.scan.connected', { name: connection.name }),
          variant: 'success',
        });
        router.dismissTo('/settings/device-connections');
      } catch (error) {
        alert.show({ title: desktopConnectionErrorMessage(error, t) });
        setHasScanned(false);
      }
    },
    [alert, connectionId, pair, router, t, toast],
  );

  const parseAndSubmit = useCallback(
    (value: string) => {
      try {
        const parsed = DesktopPairingQrSchema.safeParse(JSON.parse(value));
        if (!parsed.success) {
          throw new Error('invalid QR');
        }
        setHasScanned(true);
        void submit(parsed.data);
      } catch {
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
        {!permission ? (
          <ContentState.Loading title={t('settings.deviceConnections.scan.loadingCamera')} />
        ) : permission.granted ? (
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
                permission.canAskAgain
                  ? {
                      children: t('settings.deviceConnections.scan.allowCamera'),
                      onPress: () => void requestPermission(),
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
