import type { PluginText } from '@/shared/data/types/plugin';

export function getPluginText(text: PluginText, language: string): string {
  return text[language.toLowerCase()] ?? text.default;
}
