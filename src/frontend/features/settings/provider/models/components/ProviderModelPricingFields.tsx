import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Button, Chip, Input, Section, TextField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { CURRENCY } from '@/shared/data/types/model';

import {
  type ModelPricingDraft,
  type ModelPricingErrors,
  type ModelPriceTierDraft,
  modelPriceFields,
} from '../utils/providerModelPricing';
import { ProviderModelFormSection } from './ProviderModelFormSection';
import { ProviderModelNumberField } from './ProviderModelNumberField';

export function ProviderModelPricingFields({
  draft,
  errors,
  disabled,
  onChange,
}: {
  draft: ModelPricingDraft;
  errors: ModelPricingErrors;
  disabled: boolean;
  onChange: (draft: ModelPricingDraft) => void;
}) {
  const { t } = useTranslation();
  const [expandedTierId, setExpandedTierId] = useState<number | null>(draft.tiers[0]?.id ?? null);
  const hasErrors = errors.some((tier) => Object.keys(tier).length > 0);
  const hasPrices = draft.tiers.some((tier) =>
    modelPriceFields.some((field) => tier[field].trim()),
  );
  function updateTier(id: number, field: Exclude<keyof ModelPriceTierDraft, 'id'>, value: string) {
    onChange({
      ...draft,
      tiers: draft.tiers.map((tier) => (tier.id === id ? { ...tier, [field]: value } : tier)),
    });
  }
  return (
    <ProviderModelFormSection
      title={t('settings.provider.models.pricing.title')}
      summary={
        hasPrices || draft.tiers.length > 1
          ? draft.tiers.length > 1
            ? t('settings.provider.models.pricing.summary', {
                currency: draft.currency,
                value: draft.tiers.length - 1,
              })
            : draft.currency
          : undefined
      }
      errorMessage={hasErrors ? t('settings.provider.models.pricing.invalidFields') : undefined}
      disabled={disabled}
    >
      <View className="flex-row flex-wrap items-center gap-3 px-4 pb-3">
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.provider.models.pricing.currency')}
        >
          {([CURRENCY.USD, CURRENCY.CNY] as const).map((currency) => (
            <Chip.Selectable
              key={currency}
              className="min-h-11"
              accessibilityRole="radio"
              disabled={disabled}
              selected={draft.currency === currency}
              onSelectedChange={(selected) => {
                if (selected) onChange({ ...draft, currency });
              }}
            >
              {t(`settings.provider.models.pricing.${currency}`)}
            </Chip.Selectable>
          ))}
        </View>
        <Text className="text-muted-foreground text-sm">
          {t('settings.provider.models.pricing.unit')}
        </Text>
      </View>
      {draft.tiers.map((tier, index) => {
        const isExpanded = expandedTierId === tier.id;
        const hasTierErrors = Object.keys(errors[index] ?? {}).length > 0;
        const rateSummary = (['input', 'output'] as const)
          .filter((field) => tier[field].trim())
          .map((field) => `${t(`settings.provider.models.pricing.${field}`)} ${tier[field].trim()}`)
          .join(' · ');
        const tierLabel = t(
          index === 0
            ? 'settings.provider.models.pricing.baseTier'
            : 'settings.provider.models.pricing.tier',
          { index },
        );
        const tierError = hasTierErrors
          ? t('settings.provider.models.pricing.checkTier')
          : undefined;
        const tierSummary =
          index === 0
            ? rateSummary
            : tier.minInputTokens.trim()
              ? t('settings.provider.models.pricing.thresholdSummary', {
                  tokens: tier.minInputTokens.trim(),
                })
              : undefined;
        return (
          <View key={tier.id}>
            <Section.Item
              label={tierLabel}
              accessibilityLabel={[tierLabel, tierError ?? tierSummary].filter(Boolean).join(', ')}
              description={
                tierError ? <Text className="text-error text-sm">{tierError}</Text> : undefined
              }
              accessibilityState={{ expanded: isExpanded }}
              disabled={disabled}
              trailing={
                <View className="min-w-0 flex-row items-center gap-2">
                  {!isExpanded && !hasTierErrors && tierSummary ? (
                    <Text
                      className="min-w-0 shrink text-right text-sm text-muted-foreground"
                      numberOfLines={1}
                    >
                      {tierSummary}
                    </Text>
                  ) : null}
                  {isExpanded ? (
                    <ChevronUpIcon className="size-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </View>
              }
              onPress={() => {
                Keyboard.dismiss();
                setExpandedTierId(isExpanded ? null : tier.id);
              }}
            />
            {isExpanded ? (
              <View className="gap-4 px-4 pb-4">
                {index > 0 ? (
                  <View className="gap-1">
                    <ProviderModelNumberField
                      disabled={disabled}
                      label={t('settings.provider.models.pricing.minInputTokens')}
                      placeholder="200000"
                      value={tier.minInputTokens}
                      onChangeText={(value) => updateTier(tier.id, 'minInputTokens', value)}
                      errorMessage={
                        errors[index]?.minInputTokens ? t(errors[index].minInputTokens) : undefined
                      }
                    />
                    <Text className="text-muted-foreground text-xs">
                      {t('settings.provider.models.pricing.tierHelp')}
                    </Text>
                  </View>
                ) : null}
                {modelPriceFields.map((field) => (
                  <TextField
                    key={field}
                    disabled={disabled}
                    invalid={Boolean(errors[index]?.[field])}
                  >
                    <TextField.Label>
                      {t(`settings.provider.models.pricing.${field}`)}
                    </TextField.Label>
                    <Input
                      accessibilityLabel={[
                        tierLabel,
                        t(`settings.provider.models.pricing.${field}`),
                        draft.currency,
                        t('settings.provider.models.pricing.unit'),
                      ].join(', ')}
                      autoCorrect={false}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      value={tier[field]}
                      placeholder={t(
                        field === 'input' || field === 'output'
                          ? 'settings.provider.models.detail.unknown'
                          : 'settings.provider.models.pricing.useInputPrice',
                      )}
                      onChangeText={(value) => updateTier(tier.id, field, value)}
                    />
                    <TextField.Error>
                      {errors[index]?.[field] ? t(errors[index][field]) : undefined}
                    </TextField.Error>
                  </TextField>
                ))}
                {index > 0 ? (
                  <Button
                    disabled={disabled}
                    variant="ghost"
                    accessibilityLabel={t('settings.provider.models.pricing.removeTier', { index })}
                    onPress={() => {
                      Keyboard.dismiss();
                      setExpandedTierId(draft.tiers[index - 1].id);
                      onChange({
                        ...draft,
                        tiers: draft.tiers.filter((item) => item.id !== tier.id),
                      });
                    }}
                  >
                    {t('settings.provider.models.pricing.removeTier', { index })}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <View className="p-4">
        <Button
          disabled={disabled}
          variant="outline"
          onPress={() => {
            Keyboard.dismiss();
            const previous = draft.tiers[draft.tiers.length - 1];
            const id = Math.max(...draft.tiers.map((tier) => tier.id)) + 1;
            setExpandedTierId(id);
            onChange({
              ...draft,
              tiers: [...draft.tiers, { ...previous, id, minInputTokens: '' }],
            });
          }}
        >
          {t('settings.provider.models.pricing.addTier')}
        </Button>
      </View>
    </ProviderModelFormSection>
  );
}
