import {
  checkCatalog,
  checkSourceKeys,
  readCatalog,
  sortCatalog,
  synchronizeCatalog,
} from '../i18nCatalog';

describe('translation catalog checks', () => {
  const base = { files_one: '{{count}} file', files_other: '{{count}} files', save: 'Save' };

  test('rejects duplicate keys before JSON parsing can hide one', () => {
    expect(() => readCatalog('{"save":"Save","save":"Overwrite"}', 'en-us.json')).toThrow(
      'duplicate key save',
    );
    expect(() => readCatalog('{"save":{"label":"Save"}}', 'en-us.json')).toThrow(
      'must be a string',
    );
  });

  test('validates each language’s plural forms instead of copying English categories', () => {
    expect(checkCatalog(base, { files_other: '{{count}} 个文件', save: '保存' }, 'zh-CN')).toEqual(
      [],
    );
    const russian = sortCatalog({
      files_one: '{{count}} файл',
      files_few: '{{count}} файла',
      files_many: '{{count}} файлов',
      files_other: '{{count}} файла',
      save: 'Сохранить',
    });
    expect(checkCatalog(base, russian, 'ru-RU')).toEqual([]);
    delete russian.files_few;
    expect(checkCatalog(base, russian, 'ru-RU')).toContain('files_few: missing translation');
  });

  test('rejects incomplete values and damaged placeholders', () => {
    const source = { hint: '<link>{{name}}</link> $t(common.help)' };
    expect(checkCatalog(source, { hint: '' }, 'en-US')).toContain('hint: empty translation');
    expect(checkCatalog(source, { hint: '[to be translated]: text' }, 'en-US')).toContain(
      'hint: unfinished translation',
    );
    const errors = checkCatalog(
      source,
      { hint: '<other>{{title}}</other> $t(common.close)' },
      'en-US',
    );
    expect(errors).toContain('hint: interpolation mismatch');
    expect(errors).toContain('hint: component tag mismatch');
    expect(errors).toContain('hint: nested translation mismatch');
  });

  test('sync preserves translations, migrates a Chinese count key, and is idempotent', () => {
    const synchronized = synchronizeCatalog(
      base,
      { files: '{{count}} 个文件', old: '旧键' },
      'zh-CN',
    );
    expect(synchronized).toEqual({
      files_other: '{{count}} 个文件',
      save: '[to be translated]: Save',
    });
    expect(synchronizeCatalog(base, synchronized, 'zh-CN')).toEqual(synchronized);
  });

  test('protects protocol and product names while allowing capitalization differences', () => {
    const source = { connect: 'Connect GitHub through MCP' };
    expect(
      checkCatalog(source, { connect: '通过 MCP 连接 Github' }, 'zh-CN', ['GitHub', 'MCP']),
    ).toEqual([]);
    expect(checkCatalog(source, { connect: '连接 GitHub' }, 'zh-CN', ['MCP'])).toContain(
      'connect: missing protected term MCP',
    );
  });

  test('source checks catch missing literal and conditional keys but accept plural stems', () => {
    const errors = checkSourceKeys(
      'example.ts',
      `
      import { useTranslation } from 'react-i18next';
      t('files', { count: 2 });
      t(ready ? 'save' : 'missing');
      // t('comment.only')
    `,
      base,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknown translation key missing');
  });
});
