import { PreferenceSwitchItem } from '../../components/PreferenceSwitchItem';

export function EnterToSendSetting() {
  return (
    <PreferenceSwitchItem
      preferenceKey="chat.input.enter_to_send"
      labelKey="settings.enterToSend.title"
      failedKey="settings.enterToSend.saveFailed"
      testID="settings-enter-to-send"
    />
  );
}
