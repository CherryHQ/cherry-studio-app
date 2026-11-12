# Agent Templates

Bundled snapshot of [Cherry Desktop's template catalogs](https://github.com/CherryHQ/cherry-studio/tree/bc215da7204393c838b92bd19a4cfad20ec7d78d/resources/data)
at commit `bc215da7204393c838b92bd19a4cfad20ec7d78d`, distributed under the upstream
GNU Affero General Public License v3.0 (see the repository [license](../../../LICENSE)).

Each language contains 796 templates: 780 entries from `agents-en.json` / `agents-zh.json`,
followed by the 16 entries from `marketplace-agents.json`. Names, descriptions, prompts, emoji,
source groups and IDs are preserved. The latter catalog supplies bilingual names/descriptions
and one shared English instruction body; that body is preserved in both snapshots.

`categories` adds Mobile's browsing filters without changing the source groups or instructions.
Writing includes writing, copywriting, translation, language, communication and documentation;
Office includes career, business, office, consulting, management, legal, marketing, finance,
productivity, data/analytics, analysis and review; Programming includes programming and developer
tools; Learning includes education, academic, science and encyclopedia; Life includes life,
emotion, entertainment, games, medical, health and travel; Creative includes creative, art,
design and music. A template may match several filters. All also includes source entries tagged
only with General, Tools or Featured; it is the complete catalog and has no recommendation block.

The shared app-language resolver selects Chinese source content for `zh-CN` / `zh-TW` and English
for other UI languages. This source-content policy is independent of the fully translated market
controls. Creating an Agent copies the selected content into its draft once; subsequent language
changes never translate the user's saved name or instructions.

The UI resolves a template ID and source language locally rather than passing prompts through
route URLs. Importing a template supplies only its name, emoji and instructions: models and tools
remain owned by the existing Agent creation workflow.
