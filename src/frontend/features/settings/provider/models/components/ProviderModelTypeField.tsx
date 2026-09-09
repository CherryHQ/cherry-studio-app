import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import type { ProviderModelPrimaryType } from '../utils/providerModelAdd';

export function ProviderModelTypeField({
  value,
  disabled,
  onChange,
}: {
  value: ProviderModelPrimaryType | null;
  disabled: boolean;
  onChange: (type: ProviderModelPrimaryType) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const title = t('settings.provider.models.classification.type');
  const valueLabel = value
    ? t(`settings.provider.models.classification.${value}`)
    : t('settings.provider.models.detail.unknown');
  const options = (['text', 'image', 'embedding', 'rerank'] as const).map((type) => ({
    value: type,
    label: t(`settings.provider.models.classification.${type}`),
    description:
      type === 'embedding' || type === 'rerank'
        ? t('settings.provider.models.classification.managementOnly')
        : undefined,
  }));
  return (
    <>
      <Section.SelectItem
        label={title}
        value={valueLabel}
        accessibilityLabel={`${title}, ${valueLabel}`}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setIsOpen(true);
        }}
      />
      {isOpen ? (
        <OptionPickerBottomSheet<ProviderModelPrimaryType | ''>
          open
          title={title}
          options={options}
          selectedValue={value ?? ''}
          onValueChange={(type) => {
            if (type) onChange(type);
          }}
          onClose={() => setIsOpen(false)}
          size="compact"
        />
      ) : null}
    </>
  );
}
