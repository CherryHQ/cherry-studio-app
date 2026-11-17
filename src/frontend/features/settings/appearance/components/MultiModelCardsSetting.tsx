import { PreferenceSwitchItem } from '../../components/PreferenceSwitchItem';

export function MultiModelCardsSetting() {
  return (
    <PreferenceSwitchItem
      preferenceKey="chat.multi_model.cards_enabled"
      labelKey="settings.multiModelCards.title"
      failedKey="settings.multiModelCards.saveFailed"
      testID="settings-multi-model-cards"
    />
  );
}
