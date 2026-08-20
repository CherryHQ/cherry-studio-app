import {
  Label,
  SecureInput,
  type SecureInputVisibilityAccessibilityLabels,
  TextField,
} from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  onCommit,
}: {
  apiKeysInput: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <TextField>
      {/* Semibold to match the `Section.Header` of the connectivity check right
          below it — heroui's own label default is only medium. */}
      <Label>
        <Label.Text className="font-semibold">
          {t('settings.provider.apiService.apiKeys')}
        </Label.Text>
      </Label>
      <View className="overflow-hidden">
        <ApiKeysCommitInput
          accessibilityLabel={t('settings.provider.apiService.apiKeys')}
          onCommit={onCommit}
          placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
          value={apiKeysInput}
          visibilityAccessibilityLabels={{
            hide: t('settings.provider.apiService.hideApiKeys'),
            show: t('settings.provider.apiService.showApiKeys'),
          }}
        />
      </View>
    </TextField>
  );
}

function ApiKeysCommitInput({
  accessibilityLabel,
  onCommit,
  placeholder,
  value,
  visibilityAccessibilityLabels,
}: {
  accessibilityLabel: string;
  onCommit: (value: string) => void;
  placeholder: string;
  value: string;
  visibilityAccessibilityLabels: SecureInputVisibilityAccessibilityLabels;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  const commitValue = useCallback(() => {
    if (draftValue !== value) {
      onCommit(draftValue);
    }
  }, [draftValue, onCommit, value]);

  const handleChangeText = useCallback((nextValue: string) => {
    setDraftValue(normalizeApiKeysInputSingleLine(nextValue));
  }, []);

  return (
    <SecureInput
      accessibilityLabel={accessibilityLabel}
      lineBreakModeIOS="clip"
      numberOfLines={1}
      onBlur={commitValue}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      returnKeyType="done"
      selectTextOnFocus
      value={draftValue}
      visibilityAccessibilityLabels={visibilityAccessibilityLabels}
    />
  );
}

function normalizeApiKeysInputSingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ',');
}
