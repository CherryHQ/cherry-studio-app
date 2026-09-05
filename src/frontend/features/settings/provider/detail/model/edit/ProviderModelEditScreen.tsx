import {
  Button,
  Input,
  OptionPickerBottomSheet,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useMutation } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { useProviderApiServiceSheetClose } from '../../../apiService';
import {
  getProviderChatEndpointTypes,
  getProviderModelEndpointLabelKey,
} from '../../../models/utils/providerModelAdd';
import {
  getProviderModelEndpointSelection,
  PROVIDER_DEFAULT_ENDPOINT_SELECTION,
  type ProviderModelEndpointSelection,
} from '../../../models/utils/providerModelEndpoint';
import { refreshProviderModelQueries } from '../../../models/utils/refreshProviderModelQueries';
import { ProviderModelPage } from '../components/ProviderModelPage';
import {
  buildModelEditPatch,
  createModelEditDraft,
  modelLimitFields,
  type ModelEditDraft,
} from '../utils/providerModelEdit';

export default function ProviderModelEditScreen() {
  return (
    <ProviderModelPage>
      {(model, provider) => <ModelEditor key={model.id} model={model} provider={provider} />}
    </ProviderModelPage>
  );
}

function ModelEditor({ model, provider }: { model: Model; provider: Provider }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation('PATCH', '/models/:uniqueModelId*');
  const [initial] = useState(() => createModelEditDraft(model));
  const [draft, setDraft] = useState(initial);
  const [initialEndpoint] = useState(() => getProviderModelEndpointSelection(model));
  const [endpoint, setEndpoint] = useState<ProviderModelEndpointSelection>(initialEndpoint);
  const [isEndpointOpen, setIsEndpointOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const patch = buildModelEditPatch(initial, draft);
  const isDirty =
    Object.keys(initial).some(
      (key) => initial[key as keyof ModelEditDraft] !== draft[key as keyof ModelEditDraft],
    ) || endpoint !== initialEndpoint;
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: isDirty,
    isSaving,
  });
  const setField = (field: keyof ModelEditDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = async () => {
    if (!patch || !isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await mutation.trigger({
        params: { uniqueModelId: model.id },
        body: {
          ...patch,
          ...(endpoint !== initialEndpoint
            ? { endpointTypes: endpoint === PROVIDER_DEFAULT_ENDPOINT_SELECTION ? [] : [endpoint] }
            : {}),
        },
      });
      await refreshProviderModelQueries(queryClient, provider.id);
      toast.show({ label: t('settings.provider.models.detail.saved'), variant: 'success' });
      allowNavigation();
      router.dismissTo({
        pathname: '/settings/provider/[providerId]/model',
        params: { providerId: provider.id, modelId: model.id },
      });
    } catch {
      toast.show({ label: t('settings.provider.models.detail.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };
  const endpointOptions = [
    {
      label: t('settings.provider.models.detail.defaultEndpoint'),
      value: PROVIDER_DEFAULT_ENDPOINT_SELECTION,
    },
    ...getProviderChatEndpointTypes(provider).map((value) => ({
      label: t(getProviderModelEndpointLabelKey(value)),
      value,
    })),
  ];
  return (
    <>
      <RouteHeader
        onBack={requestClose}
        title={t('settings.provider.models.management.edit')}
        rightActions={[
          {
            type: 'label',
            key: 'save-model',
            label: t(isSaving ? 'common.saving' : 'common.save'),
            accessibilityLabel: t('common.save'),
            disabled: !isDirty || !patch || isSaving,
            onPress: () => void save(),
          },
        ]}
      />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        mode="layout"
      >
        <View className="gap-5">
          <Text className="font-mono text-foreground-secondary text-sm">{model.modelId}</Text>
          <Text className="text-foreground-tertiary text-sm">
            {t('settings.provider.models.detail.identityReadOnly', { provider: provider.name })}
          </Text>
          {(['name', 'group', 'notes'] as const).map((field) => (
            <TextField key={field}>
              <TextField.Label>{t(`settings.provider.models.detail.${field}`)}</TextField.Label>
              <Input
                accessibilityLabel={t(`settings.provider.models.detail.${field}`)}
                disabled={isSaving}
                value={draft[field]}
                onChangeText={(value) => setField(field, value)}
              />
            </TextField>
          ))}
          {isTextGenerationModel(model) && getProviderChatEndpointTypes(provider).length > 0 ? (
            <Button variant="secondary" disabled={isSaving} onPress={() => setIsEndpointOpen(true)}>
              {t('settings.provider.models.detail.endpoint')}:{' '}
              {endpointOptions.find((option) => option.value === endpoint)?.label ??
                t('settings.provider.models.endpoint.unavailable')}
            </Button>
          ) : null}
          <Button variant="ghost" onPress={() => setIsAdvancedOpen((value) => !value)}>
            {t('settings.provider.models.detail.advanced')}
          </Button>
          {isAdvancedOpen
            ? modelLimitFields.map((field) => (
                <TextField key={field}>
                  <TextField.Label>{t(`settings.provider.models.detail.${field}`)}</TextField.Label>
                  <Input
                    accessibilityLabel={t(`settings.provider.models.detail.${field}`)}
                    disabled={isSaving}
                    inputMode="numeric"
                    value={draft[field]}
                    onChangeText={(value) => setField(field, value)}
                    placeholder={t('settings.provider.models.detail.unknown')}
                  />
                </TextField>
              ))
            : null}
          {!patch ? (
            <Text className="text-error text-sm">
              {t('settings.provider.models.detail.invalidFields')}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
      {isEndpointOpen ? (
        <OptionPickerBottomSheet<ProviderModelEndpointSelection>
          open
          onClose={() => setIsEndpointOpen(false)}
          title={t('settings.provider.models.endpoint.title')}
          options={endpointOptions}
          selectedValue={endpoint}
          onValueChange={setEndpoint}
          size="compact"
        />
      ) : null}
    </>
  );
}
