import { getDefaultValue, getPreferenceKeys, isPreferenceKey, ThemeMode } from '..';

describe('preference schema', () => {
  // The schema used to be generated from desktop's classification.json, which
  // guaranteed the key shape. It is hand-maintained now, and no lint rule in
  // this repository checks it, so the convention is pinned here instead.
  test('every key is namespace.sub.key_name', () => {
    for (const key of getPreferenceKeys()) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  test('narrows known preference keys and rejects everything else', () => {
    expect(isPreferenceKey('chat.web_search.max_results')).toBe(true);
    expect(isPreferenceKey('permissions.location_read')).toBe(false);
    // A desktop key the mobile schema deliberately does not carry.
    expect(isPreferenceKey('app.proxy.mode')).toBe(false);
    expect(isPreferenceKey('BootConfig.example')).toBe(false);
  });

  test('defaults the web search and theme values the rest of the app reads', () => {
    expect(getDefaultValue('chat.web_search.default_fetch_urls_provider')).toBe('jina');
    expect(getDefaultValue('chat.web_search.default_search_keywords_provider')).toBe('exa-mcp');
    expect(getDefaultValue('chat.web_search.max_results')).toBe(5);
    expect(getDefaultValue('chat.web_search.compression.method')).toBe('none');
    expect(getDefaultValue('chat.web_search.compression.cutoff_limit')).toBe(2000);
    expect(getDefaultValue('feature.paintings.default_model_id')).toBeNull();
    expect(getDefaultValue('ui.theme_mode')).toBe(ThemeMode.system);
    expect(getDefaultValue('ui.font_size_step')).toBe(0);
  });
});
