import { PreferenceSwitchItem } from '../../components/PreferenceSwitchItem';

export function SessionBranchTreeSetting() {
  return (
    <PreferenceSwitchItem
      preferenceKey="ui.sidebar.session_tree_enabled"
      labelKey="settings.sessionBranchTree.title"
      failedKey="settings.sessionBranchTree.saveFailed"
      testID="settings-session-branch-tree"
      options={{ optimistic: false }}
    />
  );
}
