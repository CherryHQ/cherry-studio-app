import ts from 'typescript';

export type TranslationCatalog = Record<string, string>;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
export const TRANSLATION_PLACEHOLDER = '[to be translated]: ';

export function readCatalog(text: string, filename: string): TranslationCatalog {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filename}: expected a flat object of translation strings`);
  }

  // JSON.parse otherwise silently discards the first value of a duplicate key.
  const source = ts.parseJsonText(filename, text);
  const seen = new Set<string>();
  const statement = source.statements[0];
  const expression =
    statement && ts.isExpressionStatement(statement) ? statement.expression : undefined;
  if (expression && ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) continue;
      const key = property.name.text;
      if (seen.has(key)) throw new Error(`${filename}: duplicate key ${key}`);
      seen.add(key);
    }
  }

  for (const [key, translation] of Object.entries(value)) {
    if (typeof translation !== 'string') {
      throw new Error(`${filename}: ${key} must be a string`);
    }
  }
  return value as TranslationCatalog;
}

/** Each locale owns its plural categories; English supplies meaning, not its suffix set. */
export function expectedCatalog(base: TranslationCatalog, locale: string): TranslationCatalog {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const expected: TranslationCatalog = {};
  for (const [key, value] of Object.entries(base)) {
    const stem = key.replace(PLURAL_SUFFIX, '');
    if (stem !== key && `${stem}_other` in base) {
      for (const category of categories) {
        expected[`${stem}_${category}`] = base[`${stem}_${category}`] ?? base[`${stem}_other`];
      }
    } else {
      expected[key] = value;
    }
  }
  return expected;
}

export function sortCatalog(catalog: TranslationCatalog): TranslationCatalog {
  return Object.fromEntries(
    Object.keys(catalog)
      .sort()
      .map((key) => [key, catalog[key]]),
  );
}

export function synchronizeCatalog(
  base: TranslationCatalog,
  target: TranslationCatalog,
  locale: string,
): TranslationCatalog {
  return sortCatalog(
    Object.fromEntries(
      Object.entries(expectedCatalog(base, locale)).map(([key, source]) => [
        key,
        target[key] ??
          (key.endsWith('_other') ? target[key.replace(PLURAL_SUFFIX, '')] : undefined) ??
          `${TRANSLATION_PLACEHOLDER}${source}`,
      ]),
    ),
  );
}

export function checkCatalog(
  base: TranslationCatalog,
  target: TranslationCatalog,
  locale: string,
  protectedTerms: readonly string[] = [],
): string[] {
  const errors: string[] = [];
  const expected = expectedCatalog(base, locale);
  if (JSON.stringify(Object.keys(target)) !== JSON.stringify(Object.keys(target).sort())) {
    errors.push('keys must be sorted; run pnpm i18n:sync');
  }

  for (const [key, source] of Object.entries(expected)) {
    const translation = target[key];
    if (translation === undefined) {
      errors.push(`${key}: missing translation`);
      continue;
    }
    if (!translation.trim()) errors.push(`${key}: empty translation`);
    if (/\[to be translated\]/i.test(translation)) errors.push(`${key}: unfinished translation`);

    const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    for (const term of protectedTerms) {
      if (fold(source).includes(fold(term)) && !fold(translation).includes(fold(term))) {
        errors.push(`${key}: missing protected term ${term}`);
      }
    }

    for (const [name, pattern] of [
      ['interpolation', /{{[^}]+}}/g],
      ['component tag', /<\/?[\w-]+\s*\/?>/g],
      ['nested translation', /\$t\([^)]*\)/g],
    ] as const) {
      const tokens = (text: string) => JSON.stringify((text.match(pattern) ?? []).sort());
      if (tokens(source) !== tokens(translation)) errors.push(`${key}: ${name} mismatch`);
    }
  }

  for (const key of Object.keys(target)) {
    if (!(key in expected)) errors.push(`${key}: unexpected key`);
  }
  return errors;
}

/** Only literal calls and literal conditional branches are claimed as statically covered. */
export function checkSourceKeys(
  filename: string,
  text: string,
  base: TranslationCatalog,
): string[] {
  const errors: string[] = [];
  if (!/from\s+['"][^'"]*i18n/.test(text)) return errors;
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const check = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!(node.text in base) && !(`${node.text}_other` in base)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        errors.push(`${filename}:${line}: unknown translation key ${node.text}`);
      }
    } else if (ts.isConditionalExpression(node)) {
      check(node.whenTrue);
      check(node.whenFalse);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ['t', 'i18n.t'].includes(node.expression.getText(source))) {
      if (node.arguments[0]) check(node.arguments[0]);
    } else if (
      ts.isJsxAttribute(node) &&
      node.name.getText(source) === 'i18nKey' &&
      node.initializer
    ) {
      const value = node.initializer;
      if (ts.isJsxExpression(value)) {
        if (value.expression) check(value.expression);
      } else {
        check(value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}
