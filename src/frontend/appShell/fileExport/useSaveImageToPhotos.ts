import { useAlert, useToast } from '@cherrystudio/ui/components';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { canRequestDevicePermission, canUseDevicePermission } from '@/shared/contracts';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import type { FileEntryProvenance } from '@/shared/data/types/file';

import { prepareImageExport } from './prepareImageExport';
import { useExportWatermark } from './useExportWatermark';

type PhotoSource = { uri: string; provenance?: FileEntryProvenance };

export function useSaveImageToPhotos(source: PhotoSource, options: FileExportOptions = {}) {
  const saveImages = useSaveImagesToPhotos(options);
  const permissions = useBackendModule('permissions');
  const { alert } = useAlert();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { uri, provenance } = source;
  // Retain the existing permission explanation for ordinary file and painting downloads.
  return useCallback(async () => {
    try {
      const permission = (await permissions.getStatuses(['photos.write']))['photos.write'];
      const save = async () => {
        await saveImages([{ uri, provenance }]);
      };
      if (
        !canUseDevicePermission('photos.write', permission) &&
        canRequestDevicePermission(permission)
      ) {
        alert.confirm({
          confirmLabel: t('settings.permissions.action.request'),
          description: t('imageActions.savePermissionDenied'),
          onConfirm: save,
          title: t('settings.permissions.accessRequired'),
        });
      } else await save();
    } catch {
      toast.show({ label: t('imageActions.saveFailed'), variant: 'danger' });
    }
  }, [alert, permissions, saveImages, uri, provenance, t, toast]);
}

/** One add-only permission request per batch; failed batches resume without duplicating saved pages. */
export function useSaveImagesToPhotos(options: FileExportOptions = {}) {
  const { t } = useTranslation();
  const permissions = useBackendModule('permissions');
  const { toast } = useToast();
  const { alert } = useAlert();
  const createWatermark = useExportWatermark(options.watermark);
  const saving = useRef(false);
  const completed = useRef(new Set<string>());

  return useCallback(
    async (sources: readonly PhotoSource[], signal?: AbortSignal) => {
      if (saving.current || !sources.length) return false;
      saving.current = true;
      let saved = 0;
      try {
        signal?.throwIfAborted();
        let permission = (await permissions.getStatuses(['photos.write']))['photos.write'];
        if (
          !canUseDevicePermission('photos.write', permission) &&
          canRequestDevicePermission(permission)
        ) {
          permission = (await permissions.request(['photos.write'], signal))['photos.write'];
        }
        signal?.throwIfAborted();
        if (!canUseDevicePermission('photos.write', permission)) {
          if (permission?.state === 'denied' && !permission.canAskAgain) {
            alert.confirm({
              confirmLabel: t('settings.permissions.openSystemSettings'),
              description: t('imageActions.savePermissionDenied'),
              onConfirm: () =>
                permissions.openSystemSettings('photos').catch(() => {
                  toast.show({ label: t('imageActions.openSettingsFailed'), variant: 'danger' });
                }),
              title: t('settings.permissions.accessRequired'),
            });
          } else toast.show({ label: t('imageActions.saveAccessDenied'), variant: 'danger' });
          return false;
        }
        const watermark = createWatermark();
        for (const source of sources) {
          signal?.throwIfAborted();
          if (!completed.current.has(source.uri)) {
            const exported = await prepareImageExport(source, watermark);
            try {
              signal?.throwIfAborted();
              await MediaLibrary.Asset.create(exported.uri);
              completed.current.add(source.uri);
            } finally {
              exported.release();
            }
          }
          saved++;
        }
        signal?.throwIfAborted();
        completed.current.clear();
        toast.show({ label: t('imageActions.saved'), variant: 'success' });
        return true;
      } catch {
        if (!signal?.aborted)
          toast.show({
            label: saved
              ? t('imageActions.savePartially', { saved, total: sources.length })
              : t('imageActions.saveFailed'),
            variant: 'danger',
          });
        return false;
      } finally {
        saving.current = false;
      }
    },
    [permissions, createWatermark, alert, t, toast],
  );
}
