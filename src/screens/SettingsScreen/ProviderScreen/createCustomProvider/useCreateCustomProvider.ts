import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';

import { buildCreateCustomProviderPayload } from './createCustomProviderPayload';

const SUBMITTABLE_ENDPOINT_TYPES: { type: EndpointType; labelKey: string }[] = [
  {
    type: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    labelKey: 'settings.provider.endpoint_type.openai_chat',
  },
  { type: ENDPOINT_TYPE.ANTHROPIC_MESSAGES, labelKey: 'settings.provider.endpoint_type.anthropic' },
  {
    type: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
    labelKey: 'settings.provider.endpoint_type.gemini',
  },
  {
    type: ENDPOINT_TYPE.OPENAI_RESPONSES,
    labelKey: 'settings.provider.endpoint_type.openai_responses',
  },
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
  const [selectedEndpointType, setSelectedEndpointType] = useState<EndpointType>(
    ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !isSubmitting;
  const endpointOptions = SUBMITTABLE_ENDPOINT_TYPES;

  const resetForm = useCallback(() => {
    setName('');
    setSelectedEndpointType(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
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
      const payload = buildCreateCustomProviderPayload({
        defaultChatEndpoint: selectedEndpointType,
        name: trimmedName,
      });

      const provider = await services.provider.create(payload);
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() });
      onCreated?.(provider.id, provider.name);
      setIsSheetOpen(false);
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
