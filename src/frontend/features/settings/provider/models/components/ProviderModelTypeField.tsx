import { OptionPickerBottomSheet } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { PolicySelectItem } from '@/frontend/components/Policy';

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
  // Embedding and rerank models cannot be used in chat, so they are not offered; a model that
  // already is one still shows its type.
  const options = (['text', 'image', 'speech', 'transcription'] as const).map((type) => ({
    value: type,
    label: t(`settings.provider.models.classification.${type}`),
  }));
  return (
    <>
      <PolicySelectItem
        field="model"
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
