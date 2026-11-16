import { CameraView } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { canRequestDevicePermission, type DevicePermissionStatus } from '@/shared/contracts';

import { OnboardingButton, OnboardingMessage, OnboardingPage } from '../components/OnboardingPage';

export function OnboardingScannerScreen({
  camera,
  isActive,
  isPreparing,
  onBack,
  onPaste,
  onRequest,
  onScan,
  onSettings,
  onRetry,
  scanInvalid,
  submitted,
}: {
  camera?: DevicePermissionStatus;
  isActive: boolean;
  isPreparing: boolean;
  onBack: () => void;
  onPaste: () => void;
  onRequest: () => void;
  onScan: (data: string) => void;
  onSettings: () => void;
  onRetry: () => void;
  scanInvalid: boolean;
  submitted: boolean;
}) {
  const { t } = useTranslation();
  const showCamera = !isPreparing && !scanInvalid && camera?.state === 'granted';
  const ready = isActive && !isPreparing && !submitted;
  return (
    <OnboardingPage
      description={t('settings.deviceConnections.scan.guidance')}
      footer={
        <OnboardingButton
          disabled={!ready}
          onPress={onPaste}
          testID="desktop-pairing-paste"
          variant="secondary"
        >
          {t('settings.deviceConnections.scan.pasteInvitation')}
        </OnboardingButton>
      }
      onBack={onBack}
      step={{ current: 1, total: 3, label: t('onboarding.step', { current: 1 }) }}
      testID="onboarding-desktop-scan"
      title={t('settings.deviceConnections.scan.title')}
    >
      <View
        className={
          showCamera
            ? 'aspect-square overflow-hidden rounded-3xl bg-constant-black'
            : 'aspect-square justify-center gap-4 rounded-3xl bg-card p-6'
        }
      >
        {isPreparing ? (
          <OnboardingMessage loading>
            {t('settings.deviceConnections.scan.loadingCamera')}
          </OnboardingMessage>
        ) : scanInvalid ? (
          <>
            <OnboardingMessage>{t('settings.deviceConnections.scan.invalidQr')}</OnboardingMessage>
            <OnboardingButton onPress={onRetry}>{t('common.retry')}</OnboardingButton>
          </>
        ) : showCamera ? (
          <>
            <CameraView
              active={ready}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={ready ? ({ data }) => onScan(data) : undefined}
              style={StyleSheet.absoluteFill}
            />
            <View className="flex-1 items-center justify-center" pointerEvents="none">
              <View className="aspect-square w-2/3 rounded-3xl border-2 border-constant-white" />
            </View>
          </>
        ) : (
          <>
            <OnboardingMessage>
              {t('settings.deviceConnections.scan.permissionDescription')}
            </OnboardingMessage>
            <OnboardingButton
              onPress={
                canRequestDevicePermission(camera) || camera?.state === 'error'
                  ? onRequest
                  : onSettings
              }
            >
              {t(
                canRequestDevicePermission(camera) || camera?.state === 'error'
                  ? 'settings.permissions.action.request'
                  : 'settings.permissions.openSystemSettings',
              )}
            </OnboardingButton>
          </>
        )}
      </View>
    </OnboardingPage>
  );
}
