import { isSupportedTextAttachment, resolveTextImportMediaType } from '../textFileTypes';

describe('text file types', () => {
  test.each(['notes.txt', 'settings.yaml', 'app.ts', 'data.json', 'events.jsonl'])(
    'infers %s only during an unspecified-type import',
    (name) => {
      expect(resolveTextImportMediaType(name, 'application/octet-stream')).toBe('text/plain');
      expect(resolveTextImportMediaType(name, 'application/zip')).toBe('application/zip');
      expect(isSupportedTextAttachment({ name, mediaType: 'application/octet-stream' })).toBe(
        false,
      );
    },
  );
  test('does not promote an arbitrary binary extension or overwrite a specific type', () => {
    expect(resolveTextImportMediaType('payload.exe')).toBe('application/octet-stream');
    expect(resolveTextImportMediaType('data.json', 'application/json')).toBe('application/json');
    expect(isSupportedTextAttachment({ name: 'payload.exe', mediaType: 'application/json' })).toBe(
      false,
    );
  });
});
