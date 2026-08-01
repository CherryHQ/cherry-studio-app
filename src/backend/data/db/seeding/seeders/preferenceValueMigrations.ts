import {
  SIDEBAR_FAVORITES,
  type PreferenceKeyType,
  type SidebarFavorite,
  type SidebarFavoriteItem,
} from '@cherrystudio/shared/data/preference/preferenceTypes';

type StoredPreference = {
  key: string;
  scope: string;
  value: unknown;
};

const preferenceRenames = [
  ['feature.csaas.api_key', 'feature.api_gateway.api_key'],
  ['feature.csaas.enabled', 'feature.api_gateway.enabled'],
  ['feature.csaas.host', 'feature.api_gateway.host'],
  ['feature.csaas.port', 'feature.api_gateway.port'],
  ['shortcut.general.exit_fullscreen', 'shortcut.app.fullscreen.exit'],
  ['shortcut.general.search', 'shortcut.app.search'],
  ['shortcut.general.show_main_window', 'shortcut.app.window.show'],
  ['shortcut.general.show_settings', 'shortcut.app.settings.open'],
  ['shortcut.general.toggle_sidebar', 'shortcut.app.sidebar.toggle'],
  ['shortcut.general.zoom_in', 'shortcut.app.zoom.in'],
  ['shortcut.general.zoom_out', 'shortcut.app.zoom.out'],
  ['shortcut.general.zoom_reset', 'shortcut.app.zoom.reset'],
  ['shortcut.chat.copy_last_message', 'shortcut.chat.message.copy_last'],
  ['shortcut.chat.edit_last_user_message', 'shortcut.chat.message.edit_last_user'],
  ['shortcut.chat.search_message', 'shortcut.chat.message.search'],
  ['shortcut.chat.select_model', 'shortcut.chat.model.select'],
  ['shortcut.chat.toggle_new_context', 'shortcut.chat.context.toggle_new'],
  ['shortcut.chat.clear', 'shortcut.chat.context.toggle_new'],
  ['shortcut.feature.quick_assistant.toggle_window', 'shortcut.quick_assistant.toggle'],
  ['shortcut.feature.selection.get_text', 'shortcut.selection.capture_text'],
  ['shortcut.feature.selection.toggle_enabled', 'shortcut.selection.toggle'],
  ['shortcut.topic.new', 'shortcut.topic.create'],
  ['shortcut.topic.toggle_show_topics', 'shortcut.topic.sidebar.toggle'],
  ['topic.position', 'topic.tab.position'],
] as const satisfies readonly (readonly [string, PreferenceKeyType])[];

export function collectPreferenceValueMigrations(
  rows: readonly StoredPreference[],
): StoredPreference[] {
  const defaultRows = new Map(
    rows.filter((row) => row.scope === 'default').map((row) => [row.key, row]),
  );
  const migrated: StoredPreference[] = [];

  const add = (key: PreferenceKeyType, value: unknown) => {
    if (defaultRows.has(key)) return;
    const row = { key, scope: 'default', value };
    defaultRows.set(key, row);
    migrated.push(row);
  };

  for (const [sourceKey, targetKey] of preferenceRenames) {
    const source = defaultRows.get(sourceKey);
    if (source) add(targetKey, source.value);
  }

  const visibleSidebarIcons = defaultRows.get('ui.sidebar.icons.visible')?.value;
  if (Array.isArray(visibleSidebarIcons)) {
    const allowed = new Set<string>(SIDEBAR_FAVORITES);
    const seen = new Set<string>();
    const favorites: SidebarFavoriteItem[] = [];
    for (const id of visibleSidebarIcons) {
      if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue;
      seen.add(id);
      favorites.push({ id: id as SidebarFavorite, type: 'app' });
    }
    add('ui.sidebar.favorites', favorites);
  }

  return migrated;
}
