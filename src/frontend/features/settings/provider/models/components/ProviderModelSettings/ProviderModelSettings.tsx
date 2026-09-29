import {
  BottomSheet,
  Button,
  OptionPickerBottomSheet,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, StyleSheet, Text } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ProviderValueSheet } from '../../../components/ProviderValueSheet';
import type { ProviderModelAddEndpoint } from '../../utils/providerModelAdd';
import {
  buildModelPricing,
  type ModelPricingDraft,
  modelPriceFields,
} from '../../utils/providerModelPricing';
import { ProviderModelPricingEditor } from '../ProviderModelPricingEditor';
import { ProviderModelTypeField } from '../ProviderModelTypeField';
import type { ProviderModelLimitField, ProviderModelSettingsValue } from './types';

type TextField = 'name' | 'group' | 'notes' | ProviderModelLimitField;
type TextEdit = { error?: string; field: TextField; open: boolean; text: string };
type PricingEdit = { draft: ModelPricingDraft; error?: string; open: boolean };

const LIMIT_FIELDS: readonly ProviderModelLimitField[] = [
  'contextWindow',
  'maxInputTokens',
  'maxOutputTokens',
];

/**
 * A model's settings as rows, shared by model details and adding a model. Switches change in
 * place; names, limits, notes and pricing open a sheet that edits a copy until Save.
 */
export function ProviderModelSettings({ value }: { value: ProviderModelSettingsValue }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { actions, capabilities, disabled } = value;
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [pricingEdit, setPricingEdit] = useState<PricingEdit | null>(null);
  const [isEndpointOpen, setIsEndpointOpen] = useState(false);

  const copyModelId = async (modelId: string) => {
    try {
      await Clipboard.setStringAsync(modelId);
      toast.show({ label: t('settings.provider.models.detail.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.provider.models.detail.copyFailed'), variant: 'danger' });
    }
  };
  const textSetting = (field: TextField) =>
    field === 'name'
      ? value.name
      : field === 'group'
        ? value.group
        : field === 'notes'
          ? value.notes
          : value.limits?.[field];
  const fieldLabel = (field: TextField) =>
    t(
      field === 'name'
        ? 'settings.provider.models.detail.name'
        : `settings.provider.models.detail.${field}`,
    );
  const openText = (field: TextField) => {
    Keyboard.dismiss();
    setTextEdit({ field, open: true, text: textSetting(field)?.value ?? '' });
  };
  const closeText = () => setTextEdit((current) => current && { ...current, open: false });
  const submitText = async () => {
    if (!textEdit) return;
    const { field, text } = textEdit;
    const error =
      field === 'name'
        ? await actions.rename(text)
        : field === 'group'
          ? await actions.setGroup(text)
          : field === 'notes'
            ? await actions.setNotes?.(text)
            : await actions.setLimit(field, text);
    if (error) setTextEdit((current) => current && { ...current, error });
    else closeText();
  };
  const submitPricing = async () => {
    if (!pricingEdit) return;
    const error = await actions.setPricing(pricingEdit.draft);
    if (error) setPricingEdit((current) => current && { ...current, error });
    else setPricingEdit((current) => current && { ...current, open: false });
  };

  const textRow = (field: TextField) => {
    const setting = textSetting(field);
    if (!setting) return null;
    const shown = setting.value.trim() || setting.placeholder;
    const error =
      field in (value.limits ?? {})
        ? value.limits?.[field as ProviderModelLimitField].error
        : undefined;
    return (
      <Section.Item
        description={error ? <Text className="text-error text-sm">{error}</Text> : undefined}
        disabled={disabled}
        key={field}
        label={fieldLabel(field)}
        onPress={() => openText(field)}
        showChevron
        testID={`model-setting-${field}`}
        trailing={
          shown ? (
            <Text
              className="min-w-0 shrink text-right text-base text-muted-foreground"
              numberOfLines={1}
            >
              {shown}
            </Text>
          ) : undefined
        }
      />
    );
  };

  const pricing = value.pricing;
  const hasPrices = pricing.tiers.some((tier) =>
    modelPriceFields.some((field) => tier[field].trim()),
  );
  const pricingSummary =
    hasPrices || pricing.tiers.length > 1
      ? pricing.tiers.length > 1
        ? t('settings.provider.models.pricing.summary', {
            currency: pricing.currency,
            value: pricing.tiers.length - 1,
          })
        : pricing.currency
      : t('settings.provider.config.notSet');
  const pricingErrors = pricingEdit ? buildModelPricing(pricingEdit.draft).errors : [];
  const hasPricingErrors = pricingErrors.some((tier) => Object.keys(tier).length > 0);

  return (
    <>
      <Section>
        {value.modelId ? (
          <Section.Item
            accessibilityHint={t('settings.provider.models.detail.copyId')}
            label={t('settings.provider.models.detail.modelId')}
            onPress={() => void copyModelId(value.modelId ?? '')}
            showChevron={false}
            testID="model-setting-modelId"
            trailing={
              <Text
                className="min-w-0 shrink text-right text-base text-muted-foreground"
                numberOfLines={1}
              >
                {value.modelId}
              </Text>
            }
          />
        ) : null}
        {textRow('name')}
        <ProviderModelTypeField
          disabled={disabled}
          onChange={actions.setPrimaryType}
          value={value.primaryType}
        />
        <Section.SelectItem
          accessibilityLabel={`${t('settings.provider.models.addEndpointTypeLabel')}, ${value.endpoint.label}`}
          description={
            value.endpoint.error ? (
              <Text className="text-error text-sm">{value.endpoint.error}</Text>
            ) : undefined
          }
          disabled={disabled || value.endpoint.disabled}
          label={t('settings.provider.models.addEndpointTypeLabel')}
          onPress={() => {
            Keyboard.dismiss();
            setIsEndpointOpen(true);
          }}
          value={value.endpoint.label}
        />
      </Section>

      <Section title={t('settings.provider.models.classification.capabilities')}>
        {(['reasoning', 'functionCall'] as const).map((capability) => (
          <Section.SwitchItem
            disabled={disabled}
            key={capability}
            label={t(`settings.provider.models.classification.${capability}`)}
            onValueChange={(selected) => actions.setCapability(capability, selected)}
            value={capabilities[capability]}
          />
        ))}
        <Section.SwitchItem
          disabled={disabled}
          label={t('settings.provider.models.supportsStreaming')}
          onValueChange={actions.setSupportsStreaming}
          value={value.supportsStreaming}
        />
      </Section>

      <Section title={t('settings.provider.models.classification.inputModalities')}>
        {(['vision', 'audio', 'video'] as const).map((capability) => {
          const isFixed = capability === 'vision' && value.requiresImageInput;
          return (
            <Section.SwitchItem
              disabled={disabled || isFixed}
              key={capability}
              label={t(
                isFixed
                  ? 'settings.provider.models.classification.imageInputRequired'
                  : `settings.provider.models.classification.${capability}`,
              )}
              onValueChange={(selected) => actions.setCapability(capability, selected)}
              value={capabilities[capability] || isFixed}
            />
          );
        })}
      </Section>

      {value.limits ? (
        <Section title={t('settings.provider.models.form.limits')}>
          {LIMIT_FIELDS.map((field) => textRow(field))}
        </Section>
      ) : null}

      <Section>
        <Section.Item
          disabled={disabled}
          label={t('settings.provider.models.pricing.title')}
          onPress={() => {
            Keyboard.dismiss();
            setPricingEdit({ draft: pricing, open: true });
          }}
          showChevron
          testID="model-setting-pricing"
          trailing={
            <Text
              className="min-w-0 shrink text-right text-base text-muted-foreground"
              numberOfLines={1}
            >
              {pricingSummary}
            </Text>
          }
        />
      </Section>

      <Section title={t('settings.provider.models.form.organization')}>
        {textRow('group')}
        {textRow('notes')}
      </Section>

      {textEdit ? (
        <ProviderValueSheet
          autoCapitalize={textEdit.field === 'notes' ? 'sentences' : 'none'}
          error={textEdit.error}
          keyboardType={
            LIMIT_FIELDS.includes(textEdit.field as ProviderModelLimitField)
              ? 'number-pad'
              : undefined
          }
          label={fieldLabel(textEdit.field)}
          multiline={textEdit.field === 'notes'}
          onChangeText={(text) =>
            setTextEdit((current) => current && { ...current, error: undefined, text })
          }
          onClose={closeText}
          onSubmit={() => void submitText()}
          open={textEdit.open}
          placeholder={
            textSetting(textEdit.field)?.placeholder ?? t('settings.provider.models.form.optional')
          }
          submitDisabled={textEdit.field === 'name' && value.name.required && !textEdit.text.trim()}
          testID="model-setting-sheet"
          title={fieldLabel(textEdit.field)}
          value={textEdit.text}
        />
      ) : null}

      {pricingEdit ? (
        <BottomSheet
          closeAction={{ accessibilityLabel: t('common.cancel') }}
          footer={
            <Button
              disabled={disabled || hasPricingErrors}
              onPress={() => void submitPricing()}
              testID="model-pricing-submit"
            >
              {t('common.save')}
            </Button>
          }
          onClose={() => setPricingEdit((current) => current && { ...current, open: false })}
          open={pricingEdit.open}
          size="large"
          testID="model-pricing-sheet"
          title={t('settings.provider.models.pricing.title')}
        >
          <KeyboardAvoidingView behavior="padding" style={styles.fill}>
            <ScrollView
              contentContainerStyle={styles.pricingContent}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <ProviderModelPricingEditor
                disabled={disabled}
                draft={pricingEdit.draft}
                errors={pricingErrors}
                onChange={(draft) =>
                  setPricingEdit((current) => current && { ...current, draft, error: undefined })
                }
              />
              {pricingEdit.error ? (
                <Text className="px-4 text-error text-sm">{pricingEdit.error}</Text>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheet>
      ) : null}

      {isEndpointOpen ? (
        <OptionPickerBottomSheet<ProviderModelAddEndpoint>
          onClose={() => setIsEndpointOpen(false)}
          onValueChange={actions.setEndpoint}
          open
          options={value.endpoint.options}
          selectedValue={value.endpoint.value}
          size="compact"
          title={t('settings.provider.models.addEndpointTypeLabel')}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pricingContent: { paddingBottom: 24 },
});
