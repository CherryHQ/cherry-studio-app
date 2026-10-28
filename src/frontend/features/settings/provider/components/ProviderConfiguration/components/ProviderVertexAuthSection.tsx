import { BottomSheet, Button, Input, Section, TextField } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ProviderVertexAuth } from '../types';
import {
  parseVertexAuthEdit,
  VERTEX_AUTH_LABELS,
  vertexAuthFieldValue,
} from '../utils/providerVertexAuth';

type Edit = { field: 'json' | 'project' | 'location'; text: string; touched: boolean };

/** Raw JSON stays in this editing sheet and is discarded on close or a successful save. */
export function ProviderVertexAuthSection({
  auth,
  disabled,
}: {
  auth: ProviderVertexAuth;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState<Edit | null>(null);
  const parsed = edit ? parseVertexAuthEdit(auth.config, edit.field, edit.text) : undefined;
  const error = edit?.touched ? parsed?.error : undefined;
  const email = vertexAuthFieldValue(auth.config, 'clientEmail');
  const hasPrivateKey = Boolean(vertexAuthFieldValue(auth.config, 'privateKey'));

  async function submit() {
    if (!edit || disabled || !parsed?.config) return;
    if (await auth.save(parsed.config)) setEdit((current) => (current === edit ? null : current));
  }

  return (
    <>
      <Section
        title={t('settings.provider.vertex.title')}
        footer={t('settings.provider.vertex.help')}
      >
        <Section.Item
          disabled={disabled}
          label={t('settings.provider.vertex.importJson')}
          onPress={() => setEdit({ field: 'json', text: '', touched: false })}
          testID="provider-vertex-import"
          showChevron
        />
        {(['project', 'location'] as const).map((field) => (
          // Free-text values open an editor, so the row navigates rather than selects.
          <Section.Item
            key={field}
            disabled={disabled}
            label={t(VERTEX_AUTH_LABELS[field])}
            onPress={() => setEdit({ field, text: auth.config[field], touched: false })}
            showChevron
            testID={`provider-vertex-${field}`}
            trailing={
              <Text
                className={cn(
                  'min-w-0 shrink text-right text-base',
                  auth.config[field] ? 'text-foreground' : 'text-muted-foreground',
                )}
                numberOfLines={1}
              >
                {auth.config[field] || t('settings.provider.config.notSet')}
              </Text>
            }
          />
        ))}
        <Section.Item
          label={t('settings.provider.vertex.email')}
          description={email || t('settings.provider.config.notSet')}
        />
        <Section.Item
          label={t('settings.provider.vertex.privateKey')}
          description={t(
            hasPrivateKey
              ? 'settings.provider.vertex.keyConfigured'
              : 'settings.provider.config.notSet',
          )}
        />
      </Section>
      {edit ? (
        <BottomSheet
          avoidKeyboard
          closeAction={{ accessibilityLabel: t('common.cancel') }}
          footer={
            <Button
              disabled={disabled || !parsed?.config}
              onPress={() => void submit()}
              testID="provider-vertex-save"
            >
              {t('common.save')}
            </Button>
          }
          onClose={() => setEdit(null)}
          open
          size="medium"
          testID="provider-vertex-editor"
          title={t(VERTEX_AUTH_LABELS[edit.field])}
        >
          <View className="gap-3 px-4 pt-1">
            <TextField disabled={disabled} invalid={Boolean(error)} required>
              <TextField.Label>{t(VERTEX_AUTH_LABELS[edit.field])}</TextField.Label>
              <Input
                accessibilityLabel={t(VERTEX_AUTH_LABELS[edit.field])}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                disabled={disabled}
                invalid={Boolean(error)}
                multiline={edit.field === 'json'}
                onChangeText={(text) =>
                  setEdit((current) => current && { ...current, text, touched: true })
                }
                testID="provider-vertex-input"
                value={edit.text}
              />
              <TextField.Error>{error ? t(error) : undefined}</TextField.Error>
              <TextField.Description>
                {edit.field === 'location' ? t('settings.provider.vertex.locationHelp') : undefined}
              </TextField.Description>
            </TextField>
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}
