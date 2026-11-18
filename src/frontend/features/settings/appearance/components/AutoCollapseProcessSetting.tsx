import { PreferenceSwitchItem } from '../../components/PreferenceSwitchItem';

export function AutoCollapseProcessSetting() {
  return (
    <PreferenceSwitchItem
      preferenceKey="chat.process.auto_collapse"
      labelKey="settings.autoCollapseProcess.title"
      failedKey="settings.autoCollapseProcess.saveFailed"
      testID="settings-auto-collapse-process"
    />
  );
}
