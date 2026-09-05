import {
  findMatchingUseCacheSchemaKey,
  getUseCacheDefaultValue,
  isTemplateKey,
  templateToRegex,
} from '../templateKey';

describe('isTemplateKey', () => {
  test('returns true when key contains ${...} placeholder', () => {
    expect(isTemplateKey('scroll.position.${id}')).toBe(true);
    expect(isTemplateKey('entity.cache.${type}_${id}')).toBe(true);
    expect(isTemplateKey('settings.provider.${providerId}.last_used_key_id')).toBe(true);
  });

  test('returns false for plain keys without placeholder', () => {
    expect(isTemplateKey('app.user.avatar')).toBe(false);
    expect(isTemplateKey('chat.multi_select_mode')).toBe(false);
  });

  test('returns false when only one of ${ or } is present', () => {
    expect(isTemplateKey('app.$foo')).toBe(false);
    expect(isTemplateKey('app.foo}')).toBe(false);
  });
});

describe('templateToRegex', () => {
  test('matches single placeholder with word characters and hyphens', () => {
    const regex = templateToRegex('scroll.position.${id}');
    expect(regex.test('scroll.position.topic123')).toBe(true);
    expect(regex.test('scroll.position.topic-123')).toBe(true);
    expect(regex.test('scroll.position.abc_def')).toBe(true);
  });

  test('rejects empty dynamic segment', () => {
    const regex = templateToRegex('scroll.position.${id}');
    expect(regex.test('scroll.position.')).toBe(false);
  });

  test('rejects dots in dynamic segment (dot is structural separator)', () => {
    const regex = templateToRegex('scroll.position.${id}');
    expect(regex.test('scroll.position.topic.123')).toBe(false);
  });

  test('rejects non-ASCII characters in dynamic segment (contract test for [\\w\\-]+)', () => {
    const regex = templateToRegex('settings.provider.${providerId}.last_used_key_id');
    expect(regex.test('settings.provider.中文id.last_used_key_id')).toBe(false);
    expect(regex.test('settings.provider.emoji😀.last_used_key_id')).toBe(false);
  });

  test('does not match unrelated keys', () => {
    const regex = templateToRegex('scroll.position.${id}');
    expect(regex.test('other.key.123')).toBe(false);
    expect(regex.test('scroll.positions.123')).toBe(false);
  });

  test('handles multiple placeholders', () => {
    const regex = templateToRegex('entity.cache.${type}_${id}');
    expect(regex.test('entity.cache.user_456')).toBe(true);
    expect(regex.test('entity.cache.product_abc')).toBe(true);
    expect(regex.test('entity.cache.user_')).toBe(false);
    expect(regex.test('entity.cache._456')).toBe(false);
  });

  test('matches placeholder in the middle of the key', () => {
    const regex = templateToRegex('settings.provider.${providerId}.last_used_key_id');
    expect(regex.test('settings.provider.openai.last_used_key_id')).toBe(true);
    expect(regex.test('settings.provider.my-provider_2.last_used_key_id')).toBe(true);
    expect(regex.test('settings.provider..last_used_key_id')).toBe(false);
    expect(regex.test('settings.provider.openai.other_field')).toBe(false);
  });

  test('placeholder variable name does not affect matching', () => {
    const a = templateToRegex('settings.provider.${providerId}.last_used_key_id');
    const b = templateToRegex('settings.provider.${foo}.last_used_key_id');
    expect(a.source).toBe(b.source);
    expect(a.test('settings.provider.google.last_used_key_id')).toBe(true);
    expect(b.test('settings.provider.google.last_used_key_id')).toBe(true);
  });

  test('escapes regex special characters in the template prefix', () => {
    // dots must be treated as literal dots, not "any character"
    const regex = templateToRegex('a.b.${id}');
    expect(regex.test('aXb.value')).toBe(false);
    expect(regex.test('a.b.value')).toBe(true);
  });
});

describe('findMatchingUseCacheSchemaKey', () => {
  test('returns the template pattern when concrete key matches a template entry', () => {
    expect(findMatchingUseCacheSchemaKey('internal.memory_probe.frontend')).toBe(
      'internal.memory_probe.${instanceId}',
    );
  });

  test('returns undefined when the key matches nothing', () => {
    expect(findMatchingUseCacheSchemaKey('unknown.key')).toBeUndefined();
    expect(findMatchingUseCacheSchemaKey('internal.memory_probe.')).toBeUndefined();
  });
});

describe('getUseCacheDefaultValue', () => {
  test('resolves a concrete template instance to the template default', () => {
    expect(getUseCacheDefaultValue('internal.memory_probe.frontend')).toBe('');
  });

  test('resolves the chat scroll-anchor default', () => {
    expect(getUseCacheDefaultValue('chat.scroll_anchor.session-1')).toBeNull();
  });
});
