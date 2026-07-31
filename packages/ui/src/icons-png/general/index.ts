/**
 * Auto-generated general icon registry
 * Do not edit manually.
 *
 * Total icons: 22
 */

import type { IconPngSource } from '../types';

export const GENERAL_ICONS = {
  'add-category': {
    light: require('./light/add-category.png'),
    dark: require('./light/add-category.png'),
  },
  'ai-chat': {
    light: require('./light/ai-chat.png'),
    dark: require('./light/ai-chat.png'),
  },
  'ai-essentials-icon-set': {
    light: require('./light/ai-essentials-icon-set.png'),
    dark: require('./light/ai-essentials-icon-set.png'),
  },
  'ai-prompt': {
    light: require('./light/ai-prompt.png'),
    dark: require('./light/ai-prompt.png'),
  },
  'aicon-27': {
    light: require('./light/aicon-27.png'),
    dark: require('./light/aicon-27.png'),
  },
  'brain-circuit': {
    light: require('./light/brain-circuit.png'),
    dark: require('./light/brain-circuit.png'),
  },
  'brain-cog': {
    light: require('./light/brain-cog.png'),
    dark: require('./light/brain-cog.png'),
  },
  brain: {
    light: require('./light/brain.png'),
    dark: require('./light/brain.png'),
  },
  'claude-code': {
    light: require('./light/claude-code.png'),
    dark: require('./light/claude-code.png'),
  },
  'code-ai': {
    light: require('./light/code-ai.png'),
    dark: require('./light/code-ai.png'),
  },
  emoji: {
    light: require('./light/emoji.png'),
    dark: require('./light/emoji.png'),
  },
  'gemini-cli': {
    light: require('./light/gemini-cli.png'),
    dark: require('./light/gemini-cli.png'),
  },
  'github-copilot-cli': {
    light: require('./light/github-copilot-cli.png'),
    dark: require('./light/github-copilot-cli.png'),
  },
  group: {
    light: require('./light/group.png'),
    dark: require('./light/group.png'),
  },
  'kimi-cli': {
    light: require('./light/kimi-cli.png'),
    dark: require('./light/kimi-cli.png'),
  },
  'message-ai-1': {
    light: require('./light/message-ai-1.png'),
    dark: require('./light/message-ai-1.png'),
  },
  'message-balloon-ai-1': {
    light: require('./light/message-balloon-ai-1.png'),
    dark: require('./light/message-balloon-ai-1.png'),
  },
  'open-code': {
    light: require('./light/open-code.png'),
    dark: require('./dark/open-code.png'),
  },
  'openai-codex': {
    light: require('./light/openai-codex.png'),
    dark: require('./light/openai-codex.png'),
  },
  'qoder-cli': {
    light: require('./light/qoder-cli.png'),
    dark: require('./dark/qoder-cli.png'),
  },
  'qwen-code': {
    light: require('./light/qwen-code.png'),
    dark: require('./light/qwen-code.png'),
  },
  vector: {
    light: require('./light/vector.png'),
    dark: require('./light/vector.png'),
  },
} as const satisfies Record<string, IconPngSource>;

export type GeneralIconKey = keyof typeof GENERAL_ICONS;

function toCamelCase(iconId: string) {
  const parts = iconId.split('-');

  return (
    parts[0] +
    parts
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  );
}

function toKebabCase(iconId: string) {
  return iconId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function resolveGeneralIcon(iconId: string): IconPngSource | undefined {
  if (!iconId) return undefined;

  const icons = GENERAL_ICONS as Record<string, IconPngSource>;

  return (
    icons[iconId as GeneralIconKey] ??
    icons[toKebabCase(iconId) as GeneralIconKey] ??
    icons[toCamelCase(iconId) as GeneralIconKey]
  );
}
