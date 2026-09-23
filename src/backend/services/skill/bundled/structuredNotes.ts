import type { BundledSkillDefinition } from './index';

export const structuredNotesSkill: BundledSkillDefinition = {
  name: 'structured-notes',
  revision: 1,
  requirements: {
    platforms: null,
    execution: 'none',
    builtInTools: [],
    pluginTools: [],
  },
  workflowScope: 'Turns pasted or attached text into structured notes; instructions only.',
  files: {
    'SKILL.md': `---
name: structured-notes
description: Turn meeting transcripts, pasted text, or attached documents into structured notes with decisions and action items. Use when the user shares raw text and asks for notes, minutes, a summary, or follow-ups.
license: Apache-2.0
metadata:
  author: Cherry Studio
  version: "1"
---

# Structured notes

1. Read the whole input before writing. For long attachments, page through them completely.
2. Follow \`references/template.md\`. Keep the user's terminology and names exactly.
3. Every action item needs an owner and a due date when the source states one; write "unassigned"
   or "no date" otherwise. Never invent either.
4. If the user asks to save the notes as a file, use the managed file tool with a descriptive name;
   otherwise reply in the conversation.
`,
    'references/template.md': `# Notes template

## Summary
Three sentences at most.

## Decisions
- One bullet per decision, in the order they were made.

## Action items
- [ ] Owner — task — due date

## Open questions
- Questions raised and not resolved.
`,
  },
};
