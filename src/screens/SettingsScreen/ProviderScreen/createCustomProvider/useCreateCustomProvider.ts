import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import type { EndpointType } from '@/data/types/model';

import { buildCreateCustomProviderPayload } from './createCustomProviderPayload';

const SUBMITTABLE_ENDPOINT_TYPES: { type: EndpointType; labelKey: string }[] = [
  { type: 'openai-chat-completions', labelKey: 'settings.provider.endpoint_type.openai_chat' },
  { type: 'anthropic-messages', labelKey: 'settings.provider.endpoint_type.anthropic' },
  { type: 'google-generate-content', labelKey: 'settings.provider.endpoint_type.gemini' },
  { type: 'openai-responses', labelKey: 'settings.provider.endpoint_type.openai_responses' },
];

type UseCreateCustomProviderOptions = {
  onCreated?: (providerId: string, name: string) => void;
};

export function useCreateCustomProvider({ onCreated }: UseCreateCustomProviderOptions = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selectedEndpointType, setSelectedEndpointType] =
    useState<EndpointType>('openai-chat-completions');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !isSubmitting;
  const endpointOptions = SUBMITTABLE_ENDPOINT_TYPES;

  const resetForm = useCallback(() => {
    setName('');
    setSelectedEndpointType('openai-chat-completions');
  }, []);

  const openSheet = useCallback(() => {
    resetForm();
    setIsSheetOpen(true);
  }, [resetForm]);

  const closeSheet = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setIsSheetOpen(false);
  }, [isSubmitting]);

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const existingProviders = queryClient.getQueryData<{ name: string }[]>(
        queryKeys.providers.list(),
      );

      if (
        existingProviders?.some(
          (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase(),
        )
      ) {
        toast.show({
          label: t('settings.provider.create_custom.duplicateName'),
          variant: 'danger',
        });
        setIsSubmitting(false);
        return;
      }

      const payload = buildCreateCustomProviderPayload({
        defaultChatEndpoint: selectedEndpointType,
        name: trimmedName,
      });

      const provider = await services.provider.create(payload);
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() });
      setIsSheetOpen(false);
      onCreated?.(provider.id, provider.name);
    } catch {
      toast.show({
        label: t('settings.provider.create_custom.saveFailed'),
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    selectedEndpointType,
    trimmedName,
    services.provider,
    queryClient,
    onCreated,
    t,
    toast,
  ]);

  return {
    canSubmit,
    closeSheet,
    endpointOptions,
    isSheetOpen,
    isSubmitting,
    name,
    openSheet,
    selectedEndpointType,
    setName,
    setSelectedEndpointType,
    submit,
  };
}
