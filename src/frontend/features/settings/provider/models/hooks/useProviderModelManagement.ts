import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  MODEL_SETTING_KINDS,
  MODEL_SETTING_KIND_TITLE_KEYS,
  useModelSettingSelections,
} from '@/frontend/components/ModelPicker';
import { useMutation } from '@/frontend/data';
import { MODELS_DELETE_MAX_IDS } from '@/shared/data/api/schemas/models';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

export function useProviderModelManagement(
  providerId: string,
  models: Model[],
  visibleModels: Model[],
) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { selections } = useModelSettingSelections();
  const deletion = useMutation('DELETE', '/models');
  const deleting = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<UniqueModelId> | null>(null);
  const isSelecting = selection !== null;
  const selectedIds = useMemo(
    () => new Set(models.filter((model) => selection?.has(model.id)).map((model) => model.id)),
    [models, selection],
  );
  const beginSelection = useCallback((model?: Model) => {
    if (!deleting.current) setSelection(new Set(model ? [model.id] : []));
  }, []);
  const finishSelection = useCallback(() => {
    if (!deleting.current) setSelection(null);
  }, []);
  const toggleModel = useCallback((id: UniqueModelId) => {
    if (deleting.current) return;
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = () => {
    if (deleting.current) return;
    if (visibleModels.length > MODELS_DELETE_MAX_IDS) {
      toast.show({
        label: t('settings.provider.models.management.limit', { count: MODELS_DELETE_MAX_IDS }),
        variant: 'warning',
      });
      return;
    }
    setSelection(
      visibleModels.every((model) => selectedIds.has(model.id))
        ? new Set()
        : new Set(visibleModels.map((model) => model.id)),
    );
  };

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (deleting.current || isSelecting) {
          event.preventDefault();
          finishSelection();
        }
      }),
    [finishSelection, isSelecting, navigation],
  );

  const requestDelete = (targetModels?: readonly Model[]) => {
    const targets = targetModels ?? models.filter((model) => selectedIds.has(model.id));
    if (deleting.current || targets.length === 0) return;
    if (targets.length > MODELS_DELETE_MAX_IDS) {
      toast.show({
        label: t('settings.provider.models.management.limit', { count: MODELS_DELETE_MAX_IDS }),
        variant: 'warning',
      });
      return;
    }
    const protectedModels = targets.flatMap((model) =>
      MODEL_SETTING_KINDS.filter((kind) => selections[kind] === model.id).map(
        (kind) => `${model.name} · ${t(MODEL_SETTING_KIND_TITLE_KEYS[kind])}`,
      ),
    );
    if (protectedModels.length > 0) {
      alert.confirm({
        title: t('settings.provider.models.management.protectedTitle'),
        description: t('settings.provider.models.management.protectedDescription', {
          models: protectedModels.join('\n'),
        }),
        confirmLabel: t('settings.provider.models.management.manageDefaults'),
        onConfirm: () => router.push('/settings/model'),
      });
      return;
    }
    alert.confirm({
      title: t('settings.provider.models.management.deleteTitle', { count: targets.length }),
      description: t('settings.provider.models.management.deleteDescription'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () => {
        if (deleting.current) return;
        deleting.current = true;
        setIsDeleting(true);
        void deletion
          .trigger({ query: { ids: targets.map((model) => model.id) } })
          .then(async () => {
            await refreshProviderModelQueries(queryClient, providerId);
            setSelection(null);
            toast.show({
              label: t('settings.provider.models.management.deleted', { count: targets.length }),
              variant: 'success',
            });
          })
          .catch(async (error: unknown) => {
            await refreshProviderModelQueries(queryClient, providerId);
            toast.show({
              label:
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code === 'INVALID_OPERATION'
                  ? t('settings.provider.models.management.protectedTitle')
                  : t('settings.provider.models.management.deleteFailed'),
              variant: 'danger',
            });
          })
          .finally(() => {
            deleting.current = false;
            setIsDeleting(false);
          });
      },
    });
  };

  return {
    beginSelection,
    finishSelection,
    isDeleting,
    isSelecting,
    requestDelete,
    selectedIds,
    toggleAll,
    toggleModel,
  };
}
