export const SYSTEM_PROMPT_OPTIONS = [
  {
    id: 'standard',
    titleKey: 'settings.systemPrompt.standard',
    descriptionKey: 'settings.systemPrompt.standardDescription',
  },
  {
    id: 'minimal',
    titleKey: 'settings.systemPrompt.minimal',
    descriptionKey: 'settings.systemPrompt.minimalDescription',
  },
  {
    id: 'language',
    titleKey: 'settings.systemPrompt.language',
    descriptionKey: 'settings.systemPrompt.languageDescription',
  },
] as const;

export type SystemPromptOption = (typeof SYSTEM_PROMPT_OPTIONS)[number];
