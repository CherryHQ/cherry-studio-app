import {
  DefaultPreferences,
  getDefaultValue,
  getPreferenceKeys,
  isPermissionPreferenceKey,
  isPreferenceKey,
  ThemeMode,
} from '..';

describe('preference defaults', () => {
  test('keeps the desktop preference surface and mobile permission policies', () => {
    expect(getPreferenceKeys()).toEqual(Object.keys(DefaultPreferences.default));
    expect(getPreferenceKeys()).toHaveLength(236);

    expect(getPreferenceKeys()).toEqual(
      expect.arrayContaining([
        'app.developer_mode.enabled',
        'app.language',
        'app.user.avatar',
        'chat.default_model_id',
        'chat.input.send_message_shortcut',
        'feature.quick_assistant.model_id',
        'feature.translate.model_prompt',
        'permissions.calendar_read',
        'permissions.reminders_write',
        'shortcut.chat.clear',
        'topic.naming.enabled',
        'ui.theme_mode',
        'ui.window_style',
      ]),
    );
  });

  test('returns desktop-aligned default values', () => {
    expect(getDefaultValue('app.language')).toBeNull();
    expect(getDefaultValue('app.user.avatar')).toBe('');
    expect(getDefaultValue('app.user.id')).toBe('uuid()');
    expect(getDefaultValue('app.user.name')).toBe('');
    expect(getDefaultValue('app.dist.auto_update.enabled')).toBe(true);
    expect(getDefaultValue('app.proxy.mode')).toBe('system');
    expect(getDefaultValue('assistant.icon_type')).toBe('emoji');
    expect(getDefaultValue('chat.default_model_id')).toBeNull();
    expect(getDefaultValue('chat.input.send_message_shortcut')).toBe('Enter');
    expect(getDefaultValue('chat.message.math.engine')).toBe('KaTeX');
    expect(getDefaultValue('chat.web_search.compression.cutoff_limit')).toBe(2000);
    expect(getDefaultValue('chat.web_search.compression.method')).toBe('none');
    expect(getDefaultValue('chat.web_search.default_fetch_urls_provider')).toBeNull();
    expect(getDefaultValue('chat.web_search.default_search_keywords_provider')).toBeNull();
    expect(getDefaultValue('chat.web_search.exclude_domains')).toEqual([]);
    expect(getDefaultValue('chat.web_search.max_results')).toBe(5);
    expect(getDefaultValue('chat.web_search.provider_overrides')).toEqual({});
    expect(getDefaultValue('feature.quick_assistant.model_id')).toBeNull();
    expect(getDefaultValue('feature.translate.model_id')).toBeNull();
    expect(getDefaultValue('feature.translate.model_prompt')).toContain('<translate_input>');
    expect(getDefaultValue('shortcut.chat.clear')).toEqual({
      binding: ['CommandOrControl', 'L'],
      enabled: true,
    });
    expect(getDefaultValue('topic.naming.enabled')).toBe(true);
    expect(getDefaultValue('ui.theme_mode')).toBe(ThemeMode.system);
    expect(getDefaultValue('ui.window_style')).toBe('opaque');
  });

  test('narrows known preference keys', () => {
    expect(isPreferenceKey('app.language')).toBe(true);
    expect(isPreferenceKey('chat.default_model_id')).toBe(true);
    expect(isPreferenceKey('chat.web_search.max_results')).toBe(true);
    expect(isPreferenceKey('feature.translate.model_prompt')).toBe(true);
    expect(isPreferenceKey('permissions.location_read')).toBe(true);
    expect(isPreferenceKey('BootConfig.example')).toBe(false);
    expect(Object.keys(DefaultPreferences.default)).toHaveLength(236);
  });

  test('keeps permission preferences safe by default', () => {
    expect(getDefaultValue('permissions.health_read')).toBe('never');
    expect(getDefaultValue('permissions.calendar_write')).toBe('never');
    expect(isPermissionPreferenceKey('permissions.location_read')).toBe(true);
    expect(isPermissionPreferenceKey('app.language')).toBe(false);
  });
});
