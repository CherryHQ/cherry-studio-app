import {
  Input,
  OptionPickerBottomSheet,
  Section,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useMutation } from '@/frontend/data';
import { ENDPOINT_TYPE, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { deepEqual } from '@/shared/utils/deepEqual';

import { useProviderApiServiceSheetClose } from '../../../apiService';
import { ProviderModelClassificationFields } from '../../../models/components/ProviderModelClassificationFields';
import { ProviderModelFormSection } from '../../../models/components/ProviderModelFormSection';
import { ProviderModelNumberField } from '../../../models/components/ProviderModelNumberField';
import { ProviderModelPricingFields } from '../../../models/components/ProviderModelPricingFields';
import { ProviderModelTypeField } from '../../../models/components/ProviderModelTypeField';
import {
  changeProviderModelPrimaryType,
  changeProviderModelEndpoint,
  createInitialProviderModelAddFormState,
  getProviderModelAddCapabilities,
  getProviderModelAddEndpointOptions,
  getProviderModelEndpointLabelKey,
  getProviderModelPrimaryType,
  type ProviderModelAddCapability,
  type ProviderModelAddEndpoint,
} from '../../../models/utils/providerModelAdd';
import {
  buildModelPricing,
  createModelPricingDraft,
} from '../../../models/utils/providerModelPricing';
import { refreshProviderModelQueries } from '../../../models/utils/refreshProviderModelQueries';
import { ProviderModelPage } from '../components/ProviderModelPage';
import {
  buildModelEditPatch,
  createModelEditDraft,
  createModelEditSettings,
  buildModelEditSettingsPatch,
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

function ModelEditor({ model: sourceModel, provider }: { model: Model; provider: Provider }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mutation = useMutation('PATCH', '/models/:uniqueModelId*');
  const [model] = useState(sourceModel);
  const [initial] = useState(() => createModelEditDraft(model));
  const [draft, setDraft] = useState(initial);
  const [initialSettings] = useState(() => createModelEditSettings(model));
  const [settings, setSettings] = useState(initialSettings);
  const [isEndpointOpen, setIsEndpointOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const patch = buildModelEditPatch(initial, draft);
  const settingsResult = buildModelEditSettingsPatch(model, provider, settings);
  const capabilities = getProviderModelAddCapabilities(settings, model);
  const primaryType = settings.primaryType ?? getProviderModelPrimaryType(capabilities, model);
  const pricingDraft = settings.pricing ?? createModelPricingDraft(model.pricing);
  const pricingErrors = settings.pricing
    ? buildModelPricing(settings.pricing, model.pricing).errors
    : [];
  const supportsStreaming = settings.supportsStreaming ?? model.supportsStreaming;
  const hasPricingErrors = pricingErrors.some((tier) => Object.keys(tier).length > 0);
  const limitError =
    !patch && draft.name.trim() ? t('settings.provider.models.form.invalidLimits') : undefined;
  const isDirty =
    Object.keys(initial).some(
      (key) => initial[key as keyof ModelEditDraft] !== draft[key as keyof ModelEditDraft],
    ) || !deepEqual(initialSettings, settings);
  const { allowNavigation, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: isDirty,
    isSaving,
  });
  const setField = (field: keyof ModelEditDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  function updateCapability(capability: ProviderModelAddCapability, selected: boolean) {
    setSettings((current) => {
      const overrides = { ...current.capabilities };
      const inherited = getProviderModelAddCapabilities(
        createInitialProviderModelAddFormState(),
        model,
      )[capability];
      if (selected === inherited) delete overrides[capability];
      else overrides[capability] = selected;
      return { ...current, capabilities: overrides };
    });
  }
  const save = async () => {
    if (!patch || !settingsResult.patch || !isDirty || savingRef.current) return;
    Keyboard.dismiss();
    savingRef.current = true;
    setIsSaving(true);
    try {
      await mutation.trigger({
        params: { uniqueModelId: model.id },
        body: {
          ...patch,
          ...settingsResult.patch,
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
      savingRef.current = false;
      setIsSaving(false);
    }
  };
  const endpointOptions: { value: ProviderModelAddEndpoint; label: string }[] = [
    { value: 'auto' as const, label: t('settings.provider.models.addEndpointAuto') },
    ...getProviderModelAddEndpointOptions(provider).map(({ id, labelKey }) => ({
      value: id,
      label: t(labelKey),
    })),
  ];
  if (
    settings.endpointType !== 'auto' &&
    !endpointOptions.some(({ value }) => value === settings.endpointType)
  ) {
    endpointOptions.push({
      value: settings.endpointType,
      label: t(getProviderModelEndpointLabelKey(settings.endpointType)),
    });
  }
  const endpointLabel =
    endpointOptions.find((option) => option.value === settings.endpointType)?.label ??
    t('settings.provider.models.endpoint.unavailable');
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
            disabled: !isDirty || !patch || !settingsResult.patch || isSaving,
            onPress: () => void save(),
          },
        ]}
      />
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 }}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        mode="layout"
      >
        <View className="gap-4">
          <View className="gap-1">
            <Text selectable className="font-mono text-sm text-foreground">
              {model.modelId}
            </Text>
            <Text className="text-muted-foreground text-xs">{provider.name}</Text>
          </View>
          <TextField disabled={isSaving} required invalid={!draft.name.trim()}>
            <TextField.Label>{t('settings.provider.models.detail.name')}</TextField.Label>
            <Input
              accessibilityLabel={t('settings.provider.models.detail.name')}
              autoCorrect={false}
              returnKeyType="done"
              value={draft.name}
              onChangeText={(value) => setField('name', value)}
            />
            <TextField.Error>
              {!draft.name.trim() ? t('settings.provider.models.form.nameRequired') : undefined}
            </TextField.Error>
          </TextField>
          <Section>
            <ProviderModelTypeField
              value={primaryType}
              disabled={isSaving}
              onChange={(type) =>
                setSettings((current) =>
                  changeProviderModelPrimaryType(current, type, provider, model),
                )
              }
            />
            <Section.SelectItem
              label={t('settings.provider.models.addEndpointTypeLabel')}
              accessibilityLabel={`${t('settings.provider.models.addEndpointTypeLabel')}, ${endpointLabel}`}
              value={
                <Text className="text-base text-foreground" numberOfLines={2}>
                  {endpointLabel}
                </Text>
              }
              disabled={isSaving}
              onPress={() => {
                Keyboard.dismiss();
                setIsEndpointOpen(true);
              }}
            />
            {settingsResult.error &&
            !(
              hasPricingErrors &&
              settingsResult.error === 'settings.provider.models.pricing.invalidFields'
            ) ? (
              <Text className="px-4 pb-4 text-error text-sm">{t(settingsResult.error)}</Text>
            ) : null}
          </Section>
          <ProviderModelClassificationFields
            capabilities={capabilities}
            disabled={isSaving}
            requiresImageInput={Boolean(
              settings.endpointType === initialSettings.endpointType
                ? model.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
                : settings.endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
            )}
            supportsStreaming={supportsStreaming}
            onCapabilityChange={updateCapability}
          >
            <Section.SwitchItem
              disabled={isSaving}
              label={t('settings.provider.models.supportsStreaming')}
              value={supportsStreaming}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  supportsStreaming: value === model.supportsStreaming ? undefined : value,
                }))
              }
            />
          </ProviderModelClassificationFields>
          <ProviderModelFormSection
            title={t('settings.provider.models.form.limits')}
            errorMessage={limitError}
            disabled={isSaving}
          >
            <View className="gap-4 px-4 pb-4">
              {modelLimitFields.map((field) => (
                <ProviderModelNumberField
                  key={field}
                  label={t(`settings.provider.models.detail.${field}`)}
                  disabled={isSaving}
                  value={draft[field]}
                  onChangeText={(value) => setField(field, value)}
                  placeholder={t('settings.provider.models.detail.useDefault')}
                />
              ))}
            </View>
          </ProviderModelFormSection>
          <ProviderModelPricingFields
            draft={pricingDraft}
            errors={pricingErrors}
            disabled={isSaving}
            onChange={(pricing) =>
              setSettings((current) => ({
                ...current,
                pricing: deepEqual(pricing, createModelPricingDraft(model.pricing))
                  ? undefined
                  : pricing,
              }))
            }
          />
          <ProviderModelFormSection
            title={t('settings.provider.models.form.organization')}
            summary={draft.group.trim() || draft.notes.trim() || undefined}
            disabled={isSaving}
          >
            <View className="gap-4 px-4 pb-4">
              {(['group', 'notes'] as const).map((field) => (
                <TextField key={field} disabled={isSaving}>
                  <TextField.Label>{t(`settings.provider.models.detail.${field}`)}</TextField.Label>
                  <Input
                    accessibilityLabel={t(`settings.provider.models.detail.${field}`)}
                    autoCapitalize={field === 'group' ? 'none' : 'sentences'}
                    autoCorrect={field === 'notes'}
                    multiline={field === 'notes'}
                    placeholder={t('settings.provider.models.form.optional')}
                    value={draft[field]}
                    onChangeText={(value) => setField(field, value)}
                  />
                </TextField>
              ))}
            </View>
          </ProviderModelFormSection>
        </View>
      </KeyboardAwareScrollView>
      {isEndpointOpen ? (
        <OptionPickerBottomSheet<ProviderModelAddEndpoint>
          open
          onClose={() => setIsEndpointOpen(false)}
          title={t('settings.provider.models.endpoint.title')}
          options={endpointOptions}
          selectedValue={settings.endpointType}
          onValueChange={(endpointType) =>
            setSettings((current) => changeProviderModelEndpoint(current, endpointType, model))
          }
          size="compact"
        />
      ) : null}
    </>
  );
}
