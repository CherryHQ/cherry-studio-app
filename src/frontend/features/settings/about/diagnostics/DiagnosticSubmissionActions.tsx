import { Button, Input, TextField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  diagnosticDescriptionByteLength,
  DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
} from '@/shared/contracts/diagnostics';

export function DiagnosticSubmissionActions({
  canSubmit,
  isBusy,
  onExport,
  onUpload,
}: {
  canSubmit: boolean;
  isBusy: boolean;
  onExport(): void;
  onUpload(description: string): void;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [attempted, setAttempted] = useState(false);
  const normalized = description.trim();
  const bytes = diagnosticDescriptionByteLength(normalized);
  const isValid = normalized.length > 0 && bytes <= DIAGNOSTIC_DESCRIPTION_MAX_BYTES;
  const showError = (attempted && !isValid) || bytes > DIAGNOSTIC_DESCRIPTION_MAX_BYTES;
  return (
    <View className="gap-4">
      <Button disabled={!canSubmit || isBusy} onPress={onExport} variant="secondary">
        {t('settings.about.diagnostics.export')}
      </Button>
      <TextField disabled={isBusy} invalid={showError}>
        <TextField.Label>{t('settings.about.diagnostics.description')}</TextField.Label>
        <Input
          accessibilityLabel={t('settings.about.diagnostics.description')}
          disabled={isBusy}
          invalid={showError}
          multiline
          onChangeText={setDescription}
          placeholder={t('settings.about.diagnostics.descriptionPlaceholder')}
          value={description}
        />
        <TextField.Description>
          {t('settings.about.diagnostics.descriptionHint', {
            bytes,
            limit: DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
          })}
        </TextField.Description>
        {showError && (
          <TextField.Error>{t('settings.about.diagnostics.descriptionError')}</TextField.Error>
        )}
      </TextField>
      <Button
        disabled={!canSubmit || isBusy}
        onPress={() => {
          setAttempted(true);
          if (isValid) onUpload(normalized);
        }}
      >
        {t('settings.about.diagnostics.upload')}
      </Button>
    </View>
  );
}
