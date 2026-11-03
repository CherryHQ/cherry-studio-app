import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { EnterToSendSetting } from './components/EnterToSendSetting';

export default function ChatInputSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.chatInput.title') }}>
      <Section>
        <EnterToSendSetting />
      </Section>
    </SettingsScrollPage>
  );
}
