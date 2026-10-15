# Skills

`SkillDocumentPage` owns document reading for installed, candidate, and discovered Skills. Its
translation action opens a button-anchored language menu; selecting a language starts the
request, while dismissal leaves the document unchanged. The original-text action returns to the
source; translating again opens the menu, including when a saved result exists. Chat and Skill
menus share `useTranslationLanguageMenu` and CherryUI's `ActionMenu` presentation.

`skillTranslationQueryOptions` owns target-language and content-hash query identity and the existing
persistent translation cache. Choosing a cached target reuses that result. Failed requests keep the
original visible and report localized feedback. A document revision resets the reading workflow;
changing the app language does not replace the selected target. Translation never edits the Skill.
