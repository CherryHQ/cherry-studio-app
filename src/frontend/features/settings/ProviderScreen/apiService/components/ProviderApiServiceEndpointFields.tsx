import { Input, Label, TextField } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The provider's primary Base URL, edited in place and committed on blur. Every
 * other endpoint lives in the provider's own settings screen, behind the gear in
 * the detail header, so this row stays a single field.
 */
export function ProviderApiServiceEndpointField({
  baseUrl,
  onCommit,
}: {
  baseUrl: string;
  onCommit: (value: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      <Label>
        <Label.Text className="font-semibold">
          {t('settings.provider.apiService.baseUrl')}
        </Label.Text>
      </Label>
      <PrimaryEndpointBaseUrlInput
        accessibilityLabel={t('settings.provider.apiService.baseUrl')}
        onCommit={onCommit}
        placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
        value={baseUrl}
      />
    </TextField>
  );
}

function PrimaryEndpointBaseUrlInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => Promise<boolean>;
  placeholder: string;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  const handleBlur = useCallback(() => {
    if (draftValue === value) {
      return;
    }

    void onCommit(draftValue).then((didSave) => {
      if (!didSave) {
        setDraftValue(value);
      }
    });
  }, [draftValue, onCommit, value]);

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
      onBlur={handleBlur}
      onChangeText={setDraftValue}
      placeholder={placeholder}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      value={draftValue}
    />
  );
}
