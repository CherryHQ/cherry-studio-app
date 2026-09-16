import * as fs from 'node:fs';
import * as path from 'node:path';

import { APP_LANGUAGES, DEFAULT_APP_LANGUAGE } from '../src/shared/utils/languages';
import {
  checkCatalog,
  checkSourceKeys,
  readCatalog,
  sortCatalog,
  synchronizeCatalog,
} from './i18nCatalog';
import glossary from './i18nGlossary.json';

const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIRECTORY = path.join(ROOT, 'src/frontend/i18n/locales');
const baseFilename = `${DEFAULT_APP_LANGUAGE.toLowerCase()}.json`;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'i18n', 'node_modules'].includes(entry.name)
        ? []
        : sourceFiles(filename);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories|d)\.tsx?$/.test(entry.name)
      ? [filename]
      : [];
  });
}

function main() {
  const command = process.argv[2];
  if (!['check', 'sync'].includes(command))
    throw new Error('Usage: tsx scripts/i18n.ts check|sync');

  const filenames = APP_LANGUAGES.map(({ value }) => `${value.toLowerCase()}.json`);
  const extras = fs
    .readdirSync(CATALOG_DIRECTORY)
    .filter((file) => file.endsWith('.json') && !filenames.includes(file));
  if (extras.length) throw new Error(`Unregistered locale catalogs: ${extras.join(', ')}`);

  const catalogs = new Map(
    filenames.map((filename) => {
      const fullPath = path.join(CATALOG_DIRECTORY, filename);
      if (!fs.existsSync(fullPath)) {
        if (command === 'check' || filename === baseFilename)
          throw new Error(`Missing catalog: ${filename}`);
        return [filename, {}] as const;
      }
      return [filename, readCatalog(fs.readFileSync(fullPath, 'utf8'), filename)] as const;
    }),
  );
  const base = catalogs.get(baseFilename)!;

  if (command === 'sync') {
    for (const { value: locale } of APP_LANGUAGES) {
      const filename = `${locale.toLowerCase()}.json`;
      const catalog =
        filename === baseFilename
          ? sortCatalog(base)
          : synchronizeCatalog(base, catalogs.get(filename)!, locale);
      const content = `${JSON.stringify(catalog, null, 2)}\n`;
      const fullPath = path.join(CATALOG_DIRECTORY, filename);
      if (!fs.existsSync(fullPath) || fs.readFileSync(fullPath, 'utf8') !== content) {
        fs.writeFileSync(fullPath, content);
      }
    }
    console.log('Locale catalogs synchronized. Translate every placeholder before committing.');
    return;
  }

  const errors = APP_LANGUAGES.flatMap(({ value: locale }) => {
    const filename = `${locale.toLowerCase()}.json`;
    return checkCatalog(base, catalogs.get(filename)!, locale, glossary.doNotTranslate).map(
      (error) => `${filename}: ${error}`,
    );
  });
  for (const filename of sourceFiles(path.join(ROOT, 'src'))) {
    errors.push(
      ...checkSourceKeys(path.relative(ROOT, filename), fs.readFileSync(filename, 'utf8'), base),
    );
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(`Translation checks passed for ${APP_LANGUAGES.length} languages.`);
}

main();
