# Internationalization

Mobile owns its locale catalogs and language behavior independently of desktop.

## Language Contract

[`APP_LANGUAGES`](../../src/shared/utils/languages.ts) defines the supported languages, native
display names, and shared resolver. It currently covers Simplified Chinese, Traditional Chinese,
English, German, Japanese, Russian, Greek, Spanish, French, Portuguese, Romanian, Vietnamese,
and Turkish.

- `app.language: null` follows the device's ordered language preferences. Settings exposes this
  as **Follow system**; selecting a language stores its canonical code.
- Explicit preferences win. Unknown saved values resolve to English without rewriting storage.
- Regional variants match their supported language, for example `fr-CA` to `fr-FR` and `pt-BR`
  to `pt-PT`. Chinese script takes precedence over region: `zh-Hans-HK` uses Simplified Chinese,
  while `zh-Hant`, `zh-TW`, `zh-HK`, and `zh-MO` use Traditional Chinese.
- Bootstrap initializes translations before first-run data is seeded. After bootstrap,
  `LanguagePreferenceObserver` observes committed preferences and Expo locale changes. Language
  changes are serialized by the i18n module. Failed preference writes retain the old value and
  show a translated error.
- The Agent reads the same resolver with the current preference and full device language tags.
  Backend code must not import frontend i18n or implement another language fallback policy.
- `app.config.ts` derives the native supported-language declaration from the same list. Native
  configuration changes need a new development build; changing JavaScript does not rebuild it.
  It registers `tsx/cjs` to import the shared TypeScript module, following
  [Expo's configuration guidance](https://docs.expo.dev/workflow/configuration/).

## Catalog Ownership

[`src/frontend/i18n/locales`](../../src/frontend/i18n/locales) owns application UI translations.
English (`en-us.json`) is the canonical source; Chinese provides semantic context. Catalogs are
flat, sorted JSON objects. The whole dotted key is literal: i18next uses `keySeparator: false`.
The resource registry uses static imports so all languages work offline in Metro.

The initial additional locales combine matching existing desktop translations with Google
Translate drafts and targeted terminology/plural corrections. Traditional Chinese also uses
converted Simplified Chinese text with terminology adjustments. This describes the initial
catalogs' provenance, not an ongoing translation service. Passing checks establishes structural
coverage, not semantic accuracy.

Feature owners translate text before passing it to CherryUI. Translate user-visible text,
accessibility labels, notifications, and user-facing errors. Keep technical identifiers, logs,
model output, and user-authored content unchanged. Follow
[Domain Language](../references/domain-language.md) for Agent, Session, Provider, and other product
terms; preserve product and protocol names such as Cherry Studio, MCP, OpenAI, and GitHub.
[`scripts/i18nGlossary.json`](../../scripts/i18nGlossary.json) owns protected names and preferred
terminology. Protected names are checked automatically; preferred terms guide translation and
review rather than rejecting legitimate grammatical inflections.

Use `{{name}}` interpolation instead of concatenating sentence fragments. Preserve interpolations,
component tags, and `$t(...)` references in every translation. Finite dynamic states should use
explicit key maps; a variable argument is not evidence that every possible key exists.

For counted text, use `t('files.count', { count })`. English has `_one` and `_other`, Chinese and
Japanese have `_other`, and Russian also needs `_few` and `_many`. The tooling derives each
language's categories with `Intl.PluralRules`; it does not copy English's suffix set to all
languages. Keep zero-specific product wording out of the catalog until its lookup and checks are
implemented together.

The runtime loads `intl-pluralrules` before initializing i18next because Hermes does not provide
`Intl.PluralRules`. Keep this compatibility layer when changing the translation initialization;
otherwise counted text can silently select English plural categories.

Pass the resolved app language to date and number formatters. Preserve deliberate product formats
such as the compact chat token count. Device region, currency, and timezone are separate preferences
and must not be changed merely because the UI language changed.

Painting template names and prompts have a separate catalog under
[`assets/paintings/templates`](../../assets/paintings/templates/README.md). Its current explicit
policy is Simplified Chinese for `zh-CN` and English for other languages; user-edited prompts are
never retranslated. Native permission descriptions in `app.json` are also separate from the UI
catalog and currently use English. Adding a UI language does not claim those separate resource
surfaces have translations.

## Changing Translations

Translation is part of the coding AI's development work: it writes all supported languages
directly using the feature context and glossary. CI only validates the resulting files. Do not
add an automatic translation workflow or external translation service.

1. Add or update the English source and accurate Chinese text. Choose a key that describes the
   feature's meaning, not its position or current wording.
2. Run `pnpm i18n:sync`. This explicitly modifies catalogs: it sorts keys, creates missing locale
   files, scaffolds missing values with `[to be translated]`, and removes obsolete keys. Review
   its diff. It preserves existing translations, including migrating a legacy unsuffixed count
   key to `_other`.
3. The coding AI translates every new or changed value in every supported language in the same
   change. When English wording changes under an existing key, update its existing translations
   as well: sync cannot infer that a fluent translation has become stale.
4. Review meaning, terminology, tone, and text length. Automated checks do not establish semantic
   accuracy.
5. Run `pnpm i18n:check` when validation is authorized. It is read-only and fails for missing or
   unregistered catalogs, malformed/duplicate/non-string keys, unsorted keys, incorrect key sets
   and plural categories, empty/pending values, damaged placeholders, dropped protected names,
   and unknown literal translation calls (including literal conditional branches).

The source check covers literal `t(...)`, `i18n.t(...)`, and `<Trans i18nKey>` references in app
production sources importing i18n. It does not prove dynamic key maps or arbitrary helper calls,
detect all hardcoded strings, determine whether text is actually translated, or delete unused
keys. Review those cases in the owning feature; never treat a missing literal reference as proof
that a resource can be deleted.

The PR CI lint job runs the translation check. The editor uses i18n Ally with the current catalog
path and flat-key mode. Before adding a language, update the shared language list, static resource
registry, all required translations, and any native/template coverage claims together.

## Validation Ownership

The focused regressions are `src/shared/utils/__tests__/languages.test.ts`,
`scripts/__tests__/i18nCatalog.test.ts`, and the settings/i18n behavior suites. Tooling tests under
`scripts/__tests__` are excluded from the remote application suite by `PRCI`; run them explicitly
when authorized. Follow [Testing And CI](./testing-and-ci.md).

Device acceptance should cover manual/system mode, a system-language change, a failed preference
write, rapid changes, Traditional Chinese script matching, plural counts, long translated labels,
and app-language versus device-language formatting. These requirements do not authorize an agent
to run tests, create devices, or build the app without the user's request.
