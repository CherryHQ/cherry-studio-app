import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as MediaLibrary from 'expo-media-library';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

/** Shared add-only Photos permission flow for generated and managed images. */
export function useSaveImageToPhotos(uri: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();

  const saveToPhotos = useCallback(async () => {
    try {
      await MediaLibrary.Asset.create(uri);
      toast.show({ label: t('imageActions.saved'), variant: 'success' });
    } catch {
      toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
    }
  }, [uri, t, toast]);

  const showOpenSettingsAlert = useCallback(() => {
    alert.confirm({
      confirmLabel: t('settings.permissions.openSystemSettings'),
      description: t('imageActions.savePermissionDenied'),
      onConfirm: () =>
        Linking.openSettings().catch(() => {
          toast.show({ label: t('imageActions.openSettingsFailed'), variant: 'danger' });
        }),
      title: t('settings.permissions.accessRequired'),
    });
  }, [alert, t, toast]);

  const requestPhotoAccessAndSave = useCallback(async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await saveToPhotos();
      } else if (!permission.canAskAgain) {
        showOpenSettingsAlert();
      } else {
        toast.show({ label: t('imageActions.saveAccessDenied'), variant: 'danger' });
      }
    } catch {
      toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
    }
  }, [saveToPhotos, showOpenSettingsAlert, t, toast]);

  const download = useCallback(async () => {
    try {
      // Write-only (add-only) access is enough to save; the legacy
      // saveToLibraryAsync throws in SDK 57, so use the class-based Asset.create.
      const permission = await MediaLibrary.getPermissionsAsync(true);
      if (permission.granted) {
        await saveToPhotos();
      } else if (permission.canAskAgain) {
        alert.confirm({
          confirmLabel: t('settings.permissions.writeAccess'),
          description: t('imageActions.savePermissionDenied'),
          onConfirm: requestPhotoAccessAndSave,
          title: t('settings.permissions.accessRequired'),
        });
      } else {
        showOpenSettingsAlert();
      }
    } catch {
      toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
    }
  }, [alert, requestPhotoAccessAndSave, saveToPhotos, showOpenSettingsAlert, t, toast]);

  return download;
}
