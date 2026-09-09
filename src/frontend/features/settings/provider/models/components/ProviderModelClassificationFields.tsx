import { Chip, Section } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type {
  ProviderModelAddCapability,
  ProviderModelCapabilities,
} from '../utils/providerModelAdd';
import { ProviderModelFormSection } from './ProviderModelFormSection';

export function ProviderModelClassificationFields({
  capabilities,
  disabled,
  requiresImageInput,
  supportsStreaming,
  onCapabilityChange,
  children,
}: {
  capabilities: ProviderModelCapabilities;
  disabled: boolean;
  requiresImageInput: boolean;
  supportsStreaming: boolean;
  onCapabilityChange: (capability: ProviderModelAddCapability, selected: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const selectedLabels = (['reasoning', 'functionCall', 'vision', 'audio', 'video'] as const)
    .filter(
      (capability) => capabilities[capability] || (capability === 'vision' && requiresImageInput),
    )
    .map((capability) => t(`settings.provider.models.classification.${capability}`));
  if (supportsStreaming) selectedLabels.push(t('settings.provider.models.form.streaming'));
  return (
    <ProviderModelFormSection
      title={t('settings.provider.models.classification.capabilities')}
      summary={selectedLabels.join(' · ') || undefined}
      disabled={disabled}
    >
      {(['reasoning', 'functionCall'] as const).map((capability) => (
        <Section.SwitchItem
          key={capability}
          disabled={disabled}
          label={t(`settings.provider.models.classification.${capability}`)}
          value={capabilities[capability]}
          onValueChange={(selected) => onCapabilityChange(capability, selected)}
        />
      ))}
      {children}
      <View className="gap-3 px-4 pt-3 pb-4">
        <Text className="font-medium text-sm text-foreground">
          {t('settings.provider.models.classification.inputModalities')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {(['vision', 'audio', 'video'] as const).map((capability) => (
            <Chip.Selectable
              key={capability}
              className="min-h-11"
              disabled={disabled || (capability === 'vision' && requiresImageInput)}
              accessibilityRole="checkbox"
              accessibilityLabel={t(
                capability === 'vision' && requiresImageInput
                  ? 'settings.provider.models.classification.imageInputRequired'
                  : `settings.provider.models.classification.${capability}`,
              )}
              selected={capabilities[capability] || (capability === 'vision' && requiresImageInput)}
              onSelectedChange={(selected) => onCapabilityChange(capability, selected)}
            >
              {t(
                capability === 'vision' && requiresImageInput
                  ? 'settings.provider.models.classification.imageInputRequired'
                  : `settings.provider.models.classification.${capability}`,
              )}
            </Chip.Selectable>
          ))}
        </View>
      </View>
    </ProviderModelFormSection>
  );
}
