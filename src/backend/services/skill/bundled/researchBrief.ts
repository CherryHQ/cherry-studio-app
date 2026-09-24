import type { BundledSkillDefinition } from './index';

export const researchBriefSkill: BundledSkillDefinition = {
  name: 'research-brief',
  revision: 1,
  requirements: {
    platforms: null,
    execution: 'none',
    builtInTools: ['web_search', 'web_fetch'],
    pluginTools: [],
  },
  workflowScope: 'Searches the web, reads the most relevant pages, and writes a sourced brief.',
  files: {
    'SKILL.md': `---
name: research-brief
description: Research a question on the web and write a short, sourced brief. Use when the user asks to look something up, compare options, or summarize the current state of a topic with sources.
license: Apache-2.0
metadata:
  author: Cherry Studio
  version: "1"
---

# Research brief

1. Restate the question in one line and decide the two or three sub-questions that answer it.
2. Run one \`web_search\` round covering those sub-questions together.
3. Use \`web_fetch\` only for the pages whose content is needed for a claim; skip pages that the
   search snippet already answers.
4. Write the brief using \`references/structure.md\`. Cite every factual statement with the
   returned citation ids.
5. State what remains uncertain. Do not run more searches to fill minor gaps.
`,
    'references/structure.md': `# Brief structure

- **Answer** — two or three sentences that answer the question directly.
- **Key points** — at most five bullets, each with a citation.
- **Caveats** — what the sources disagree on or do not cover.
- **Sources** are rendered by the application from citations; do not add a separate list.
`,
  },
};
