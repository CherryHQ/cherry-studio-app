import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderCredentialsLink } from '@/frontend/components/ProviderCredentialsLink';
import { usePreference } from '@/frontend/data';
import type { OcrEngine } from '@/shared/contracts/fileAttachment';

import { BuiltinToolPage } from './components/BuiltinToolPage';
import { DocumentParserSetting } from './components/DocumentParserSetting';

export function DocumentParserToolScreen() {
  return (
    <BuiltinToolPage toolId="documentParser">
      <Section>
        <DocumentParserSetting />
      </Section>
    </BuiltinToolPage>
  );
}

export function OcrToolScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [engine, setEngine] = usePreference('file.ocr.engine');
  const [open, setOpen] = useState(false);
  const options = [
    {
      value: 'local' as const,
      label: t('plugins.builtinTools.ocr.local'),
      description: t('plugins.builtinTools.ocr.localDescription'),
    },
    {
      value: 'deepseek' as const,
      label: 'DeepSeek',
      description: t('plugins.builtinTools.ocr.deepseekDescription'),
    },
  ];
  return (
    <BuiltinToolPage toolId="ocr">
      <Section>
        <Section.SelectItem
          label={t('plugins.builtinTools.ocr.engine')}
          onPress={() => setOpen(true)}
          testID="settings-ocr-engine"
          value={options.find((option) => option.value === engine)?.label}
        />
        {engine === 'deepseek' ? (
          <ProviderCredentialsLink providerId="deepseek" providerName="DeepSeek" />
        ) : null}
      </Section>
      <OptionPickerBottomSheet<OcrEngine>
        onClose={() => setOpen(false)}
        onValueChange={(value) => {
          void setEngine(value).catch(() =>
            toast.show({ label: t('plugins.builtinTools.ocr.saveFailed'), variant: 'danger' }),
          );
        }}
        open={open}
        options={options}
        selectedValue={engine}
        size="compact"
        title={t('plugins.builtinTools.ocr.engine')}
      />
    </BuiltinToolPage>
  );
}
