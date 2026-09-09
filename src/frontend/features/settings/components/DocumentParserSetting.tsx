import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  ];

  const changeMode = (nextMode: DocumentParserMode) => {
    void setMode(nextMode).catch(() => {
      toast.show({ label: t('settings.documentParser.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <>
      <Section>
        <Section.SelectItem
          label={t('settings.documentParser.title')}
          onPress={() => setIsPickerOpen(true)}
          testID="settings-document-parser"
          value={t(`settings.documentParser.${mode}`)}
        />
      </Section>
      <OptionPickerBottomSheet<DocumentParserMode>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={changeMode}
        open={isPickerOpen}
        options={options}
        selectedValue={mode}
        size="compact"
        testID="document-parser-picker"
        title={t('settings.documentParser.title')}
      />
    </>
  );
}
