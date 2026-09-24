import type { BundledSkillDefinition } from './index';

export const dailyAgendaSkill: BundledSkillDefinition = {
  name: 'daily-agenda',
  revision: 1,
  requirements: {
    platforms: null,
    execution: 'none',
    builtInTools: ['calendar_list_collections', 'calendar_list_events'],
    pluginTools: [],
  },
  workflowScope: 'Reads device calendars and writes a prioritized agenda for one day.',
  files: {
    'SKILL.md': `---
name: daily-agenda
description: Build a prioritized agenda for today or a chosen day from the device calendar. Use when the user asks what is on their schedule, wants a daily plan, or asks to prepare for the day.
license: Apache-2.0
metadata:
  author: Cherry Studio
  version: "1"
---

# Daily agenda

1. Resolve the requested day. Default to today in the device time zone; never guess a different day.
2. Call \`calendar_list_collections\` once, then \`calendar_list_events\` for that day across the
   user's calendars. Do not request permissions yourself; the application handles them.
3. Group events by morning, afternoon, and evening. Flag overlaps and back-to-back meetings.
4. Read \`references/format.md\` and produce the agenda in that layout.
5. If the calendar is empty or unavailable, say so plainly; do not invent events.
`,
    'references/format.md': `# Agenda format

- Title line: the day and date.
- One line per event: time range, title, location or link when present.
- A short "Watch out" section for overlaps, travel gaps under 15 minutes, and events without a
  location. Omit the section when there is nothing to flag.
- Keep the whole agenda readable on a phone screen; no tables.
`,
  },
};
