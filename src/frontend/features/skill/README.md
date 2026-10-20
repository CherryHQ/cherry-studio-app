# Skills

`SkillPage` owns scrolling content and an optional fixed footer with bottom safe-area padding.
Candidate installation and CherryIN detail actions use this footer, including opening an already
installed Skill and installing selected collection members. The document scrolls independently of
these actions.

`SkillDocumentPage` owns document reading for installed, candidate, and discovered Skills. Its
translation action initially opens a button-anchored language menu with no selected language;
selecting a language starts the request, while dismissal leaves the document unchanged. Once a
translation is saved, the action toggles directly between the source and cached translation without
another request or language menu. Reopening the document restores its most recently saved target
and starts on the source. Chat and Skill menus share `useTranslationLanguageMenu` and CherryUI's
`ActionMenu` presentation; Skill explicitly opts out of the app-language menu default.

`skillTranslationQueryOptions` owns target-language and content-hash query identity and the existing
persistent translation cache. Reading a cached translation never invokes the model, including after
an app restart. Failed requests keep the original visible and report localized feedback. A document
revision resets the reading workflow;
changing the app language does not replace the selected target. Translation never edits the Skill.
