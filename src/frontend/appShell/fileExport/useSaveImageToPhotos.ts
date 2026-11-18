import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { canRequestDevicePermission, canUseDevicePermission } from '@/shared/contracts';

/** Shared add-only Photos permission flow for generated and managed images. */
export function useSaveImageToPhotos({ uri }: { uri: string }) {
  const save = useSaveImagesToPhotos();
  return useCallback(() => save(async () => [{ uri }]), [save, uri]);
}

export function useSaveImagesToPhotos() {
  const { t } = useTranslation();
  const permissions = useBackendModule('permissions');
  const { toast } = useToast();
  const { alert } = useAlert();
  const saving = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saving.current?.abort();
    };
  }, []);

  const saveToPhotos = useCallback(
    async (read: ReadImages) => {
      if (saving.current || !mounted.current) return;
      const controller = new AbortController();
      saving.current = controller;
      try {
        // A system permission promise can settle before the foreground event arrives.
        if (AppState.currentState !== 'active') {
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              subscription.remove();
              reject(controller.signal.reason);
            };
            const subscription = AppState.addEventListener('change', (state) => {
              if (state !== 'active') return;
              subscription.remove();
              controller.signal.removeEventListener('abort', abort);
              resolve();
            });
            controller.signal.addEventListener('abort', abort, { once: true });
          });
        }
        controller.signal.throwIfAborted();
        const images = await read(controller.signal);
        for (const image of images) {
          controller.signal.throwIfAborted();
          await MediaLibrary.Asset.create(image.uri);
        }
        controller.signal.throwIfAborted();
        toast.show({ label: t('imageActions.saved'), variant: 'success' });
      } catch {
        if (!controller.signal.aborted)
          toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
      } finally {
        if (saving.current === controller) saving.current = undefined;
      }
    },
    [t, toast],
  );

  const showOpenSettingsAlert = useCallback(() => {
    alert.confirm({
      confirmLabel: t('settings.permissions.openSystemSettings'),
      description: t('imageActions.savePermissionDenied'),
      onConfirm: () =>
        permissions.openSystemSettings('photos').catch(() => {
          toast.show({ label: t('imageActions.openSettingsFailed'), variant: 'danger' });
        }),
      title: t('settings.permissions.accessRequired'),
    });
  }, [alert, permissions, t, toast]);

  const requestPhotoAccessAndSave = useCallback(
    async (read: ReadImages) => {
      if (!mounted.current) return;
      try {
        const statuses = await permissions.request(['photos.write']);
        if (!mounted.current) return;
        const permission = statuses['photos.write'];
        if (canUseDevicePermission('photos.write', permission)) {
          await saveToPhotos(read);
        } else if (permission?.state === 'denied' && !permission.canAskAgain) {
          showOpenSettingsAlert();
        } else {
          toast.show({ label: t('imageActions.saveAccessDenied'), variant: 'danger' });
        }
      } catch {
        if (mounted.current) toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
      }
    },
    [permissions, saveToPhotos, showOpenSettingsAlert, t, toast],
  );

  const download = useCallback(
    async (read: ReadImages) => {
      if (!mounted.current) return;
      try {
        // Write-only (add-only) access is enough to save; the legacy
        // saveToLibraryAsync throws in SDK 57, so use the class-based Asset.create.
        const statuses = await permissions.getStatuses(['photos.write']);
        if (!mounted.current) return;
        const permission = statuses['photos.write'];
        if (canUseDevicePermission('photos.write', permission)) {
          await saveToPhotos(read);
        } else if (canRequestDevicePermission(permission)) {
          alert.confirm({
            confirmLabel: t('settings.permissions.action.request'),
            description: t('imageActions.savePermissionDenied'),
            onConfirm: () => requestPhotoAccessAndSave(read),
            title: t('settings.permissions.accessRequired'),
          });
        } else if (permission?.state === 'denied') {
          showOpenSettingsAlert();
        } else {
          toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
        }
      } catch {
        if (mounted.current) toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
      }
    },
    [alert, permissions, requestPhotoAccessAndSave, saveToPhotos, showOpenSettingsAlert, t, toast],
  );

  return download;
}

type ReadImages = (signal: AbortSignal) => Promise<readonly { uri: string }[]>;
