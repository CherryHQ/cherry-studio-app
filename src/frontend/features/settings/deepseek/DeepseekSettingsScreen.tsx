import { OptionPickerBottomSheet, Section, TextField, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference, useQuery } from '@/frontend/data';
import { DeepseekServicesSchema, type DeepseekServices } from '@/shared/contracts/deepseek';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

function ServiceAddress({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave(value: string): void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  return (
    <Section.Item>
      <TextField invalid={invalid}>
        <TextField.Label>{t('deepseek.address')}</TextField.Label>
        <TextField.Input
          accessibilityLabel={t('deepseek.address')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          keyboardType="url"
          onBlur={() => {
            const next = draft.trim();
            const result = DeepseekServicesSchema.shape.apiHost.safeParse(next);
            setInvalid(!result.success);
            if (!result.success) {
              return;
            }
            if (result.data !== value) onSave(result.data);
          }}
          onChangeText={(value) => {
            setDraft(value);
            setInvalid(false);
          }}
          value={draft}
        />
        <TextField.Error>{invalid ? t('deepseek.invalidAddress') : undefined}</TextField.Error>
      </TextField>
    </Section.Item>
  );
}

export default function DeepseekSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const providers = useQuery('/providers');
  const [settings, setSettings] = usePreference('feature.deepseek.services');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [picker, setPicker] = useState<'provider' | 'voice' | null>(null);
  const candidates = (providers.data ?? []).filter(
    (provider) => provider.isEnabled && provider.authType === 'api-key',
  );
  const provider = candidates.find((entry) => entry.id === settings.providerId);
  const configured = provider?.apiKeys.some((entry) => entry.isEnabled) ?? false;
  const save = async (patch: Partial<DeepseekServices>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setSettings(DeepseekServicesSchema.parse({ ...settings, ...patch }));
      await queryClient.invalidateQueries({ queryKey: ['voice'] });
    } catch {
      toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const toggles = [
    ['search', 'deepseek.search', 'deepseek.searchDescription'],
    ['ocr', 'deepseek.ocr', 'deepseek.ocrDescription'],
    ['files', 'deepseek.files', 'deepseek.filesDescription'],
    ['nativeTools', 'deepseek.nativeTools', 'deepseek.nativeToolsDescription'],
    ['safetyCheck', 'deepseek.safetyCheck', 'deepseek.safetyCheckDescription'],
  ] as const;
  return (
    <>
      <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: t('deepseek.title') }}>
        <Section footer={t('deepseek.description')}>
          <Section.SelectItem
            disabled={saving || providers.isPending}
            description={
              providers.isError
                ? t('deepseek.loadFailed')
                : settings.providerId && !configured
                  ? t('deepseek.setupRequired')
                  : undefined
            }
            label={t('deepseek.provider')}
            onPress={() => {
              if (providers.isError) void providers.refetch();
              else setPicker('provider');
            }}
            value={provider?.name ?? t('settings.select.placeholder')}
          />
          <ServiceAddress
            disabled={saving}
            key={settings.apiHost}
            onSave={(apiHost) => {
              void save({ apiHost });
            }}
            value={settings.apiHost}
          />
          {provider ? (
            <Section.Item
              label={t('settings.provider.apiService.apiKeys')}
              onPress={() =>
                router.push({
                  pathname: '/settings/provider/[providerId]',
                  params: { providerId: provider.id, providerName: provider.name },
                })
              }
            />
          ) : null}
        </Section>
        <Section>
          {toggles.map(([key, label, description]) => (
            <Section.SwitchItem
              description={t(description)}
              disabled={saving || (!configured && !settings[key])}
              key={key}
              label={t(label)}
              onValueChange={(value) => {
                void save({ [key]: value });
              }}
              value={settings[key]}
            />
          ))}
        </Section>
        <Section footer={t('deepseek.voiceDescription')}>
          <Section.SelectItem
            disabled={saving || !configured}
            label={t('settings.voice.voice')}
            onPress={() => setPicker('voice')}
            value={settings.voice === 'stella' ? 'Stella' : 'Tide'}
          />
        </Section>
      </SettingsScrollPage>
      <OptionPickerBottomSheet<string>
        onClose={() => setPicker(null)}
        onValueChange={(value) => {
          if (picker === 'provider')
            void save(
              value
                ? { providerId: value }
                : {
                    providerId: null,
                    search: false,
                    ocr: false,
                    files: false,
                    nativeTools: false,
                    safetyCheck: false,
                  },
            );
          else if (value === 'stella' || value === 'tide') void save({ voice: value });
          setPicker(null);
        }}
        open={picker !== null}
        options={
          picker === 'provider'
            ? [
                { value: '', label: t('settings.voice.engine.off') },
                ...candidates.map((entry) => ({ value: entry.id, label: entry.name })),
              ]
            : [
                { value: 'stella', label: 'Stella' },
                { value: 'tide', label: 'Tide' },
              ]
        }
        selectedValue={picker === 'provider' ? (settings.providerId ?? '') : settings.voice}
        size="medium"
        title={t(picker === 'provider' ? 'deepseek.provider' : 'settings.voice.voice')}
      />
    </>
  );
}
