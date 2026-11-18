import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderCredentialsLink } from '@/frontend/components/ProviderCredentialsLink';
import { usePreference } from '@/frontend/data/hooks';
import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';

/** The parser subscription and picker state belong to this setting, not the settings page. */
export function DocumentParserSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = usePreference('file.document_parser.mode');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const options = [
    {
      value: 'anydoc' as const,
      label: t('settings.documentParser.anydoc'),
      description: t('settings.documentParser.anydocDescription'),
    },
    {
      value: 'builtin' as const,
      label: t('settings.documentParser.builtin'),
      description: t('settings.documentParser.builtinDescription'),
    },
    {
      value: 'deepseek' as const,
      label: 'DeepSeek',
      description: t('settings.documentParser.deepseekDescription'),
    },
  ];

  const changeMode = (nextMode: DocumentParserMode) => {
    void setMode(nextMode).catch(() => {
      toast.show({ label: t('settings.documentParser.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <>
      <Section.SelectItem
        label={t('settings.documentParser.title')}
        onPress={() => setIsPickerOpen(true)}
        testID="settings-document-parser"
        value={t(`settings.documentParser.${mode}`)}
      />
      {mode === 'deepseek' ? (
        <ProviderCredentialsLink providerId="deepseek" providerName="DeepSeek" />
      ) : null}
      <OptionPickerBottomSheet<DocumentParserMode>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={changeMode}
        open={isPickerOpen}
        options={options}
        selectedValue={mode}
        size="medium"
        testID="document-parser-picker"
        title={t('settings.documentParser.title')}
      />
    </>
  );
}
