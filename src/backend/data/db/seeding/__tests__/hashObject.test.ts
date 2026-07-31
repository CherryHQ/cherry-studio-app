import { hashObject } from '../hashObject';

describe('hashObject', () => {
  test('returns a stable hash for the same JSON-serializable value', () => {
    const value = {
      default: {
        'app.language': null,
        'ui.theme_mode': 'system',
      },
    };

    expect(hashObject(value)).toBe(hashObject(value));
  });

  test('changes when seed data changes', () => {
    expect(hashObject({ value: 'system' })).not.toBe(hashObject({ value: 'dark' }));
  });
});
