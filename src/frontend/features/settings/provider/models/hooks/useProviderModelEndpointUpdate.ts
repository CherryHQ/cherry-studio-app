import { useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';

import {
  PROVIDER_DEFAULT_ENDPOINT_SELECTION,
  type ProviderModelEndpointSelection,
} from '../utils/providerModelEndpoint';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

export function useProviderModelEndpointUpdate(providerId: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useMutation('PATCH', '/models/:uniqueModelId*');
  const updateModel = updateMutation.trigger;
  const [updatingModelId, setUpdatingModelId] = useState<string>();

  const updateEndpoint = useCallback(
    async (model: Model, selection: ProviderModelEndpointSelection) => {
      if (updatingModelId) {
        return false;
      }

      setUpdatingModelId(model.id);
      try {
        await updateModel({
          body: {
            endpointTypes: selection === PROVIDER_DEFAULT_ENDPOINT_SELECTION ? [] : [selection],
          },
          params: { uniqueModelId: model.id },
        });
        await refreshProviderModelQueries(queryClient, providerId);
        return true;
      } catch {
        toast.show({
          label: t('settings.provider.models.endpoint.updateFailed'),
          variant: 'danger',
        });
        return false;
      } finally {
        setUpdatingModelId(undefined);
      }
    },
    [providerId, queryClient, t, toast, updateModel, updatingModelId],
  );

  return { updateEndpoint, updatingModelId };
}
