import { Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { PluginCredentialField } from '@/shared/data/types/plugin';

/** Renders a plugin's credential inputs; copy comes from `plugins.catalog.<id>.fields.<field>`. */
export function CredentialFields({
  pluginId,
  fields,
  values,
  invalidFields,
  disabled,
  onChange,
  onSubmit,
}: {
  pluginId: string;
  fields: readonly PluginCredentialField[];
  values: Record<string, string>;
  invalidFields: ReadonlySet<string>;
  disabled: boolean;
  onChange(fieldId: string, value: string): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {fields.map((field) => {
        const invalid = invalidFields.has(field.id);
        const label = t(`plugins.catalog.${pluginId}.fields.${field.id}.label`);
        return (
          <TextField key={field.id} invalid={invalid} disabled={disabled}>
            <TextField.Label>{label}</TextField.Label>
            <Input
              accessibilityLabel={label}
              {...(field.secret
                ? {
                    type: 'password' as const,
                    visibilityAccessibilityLabels: {
                      hide: t('plugins.hideCredential'),
                      show: t('plugins.showCredential'),
                    },
                  }
                : {
                    type: 'text' as const,
                    autoCapitalize: 'none' as const,
                    autoCorrect: false,
                  })}
              value={values[field.id] ?? ''}
              onChangeText={(value) => onChange(field.id, value)}
              disabled={disabled}
              invalid={invalid}
              maxLength={field.maxLength}
              onSubmitEditing={onSubmit}
              returnKeyType="done"
              testID={`plugin-field-${field.id}`}
            />
            <TextField.Error>
              {t(`plugins.catalog.${pluginId}.fields.${field.id}.error`)}
            </TextField.Error>
          </TextField>
        );
      })}
    </>
  );
}

export function hasEveryField(
  fields: readonly PluginCredentialField[],
  values: Record<string, string>,
) {
  return fields.every((field) => values[field.id]?.trim());
}
