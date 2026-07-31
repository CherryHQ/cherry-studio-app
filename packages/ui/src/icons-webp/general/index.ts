/**
 * Auto-generated general icon registry
 * Do not edit manually.
 *
 * Total icons: 22
 */

import type { IconSource } from '../types';

export const GENERAL_ICONS = {
  'add-category': {
    light: require('./light/add-category.webp'),
    dark: require('./light/add-category.webp'),
  },
  'ai-chat': {
    light: require('./light/ai-chat.webp'),
    dark: require('./light/ai-chat.webp'),
  },
  'ai-essentials-icon-set': {
    light: require('./light/ai-essentials-icon-set.webp'),
    dark: require('./light/ai-essentials-icon-set.webp'),
  },
  'ai-prompt': {
    light: require('./light/ai-prompt.webp'),
    dark: require('./light/ai-prompt.webp'),
  },
  'aicon-27': {
    light: require('./light/aicon-27.webp'),
    dark: require('./light/aicon-27.webp'),
  },
  'brain-circuit': {
    light: require('./light/brain-circuit.webp'),
    dark: require('./light/brain-circuit.webp'),
  },
  'brain-cog': {
    light: require('./light/brain-cog.webp'),
    dark: require('./light/brain-cog.webp'),
  },
  brain: {
    light: require('./light/brain.webp'),
    dark: require('./light/brain.webp'),
  },
  'claude-code': {
    light: require('./light/claude-code.webp'),
    dark: require('./light/claude-code.webp'),
  },
  'code-ai': {
    light: require('./light/code-ai.webp'),
    dark: require('./light/code-ai.webp'),
  },
  emoji: {
    light: require('./light/emoji.webp'),
    dark: require('./light/emoji.webp'),
  },
  'gemini-cli': {
    light: require('./light/gemini-cli.webp'),
    dark: require('./light/gemini-cli.webp'),
  },
  'github-copilot-cli': {
    light: require('./light/github-copilot-cli.webp'),
    dark: require('./light/github-copilot-cli.webp'),
  },
  group: {
    light: require('./light/group.webp'),
    dark: require('./light/group.webp'),
  },
  'kimi-cli': {
    light: require('./light/kimi-cli.webp'),
    dark: require('./light/kimi-cli.webp'),
  },
  'message-ai-1': {
    light: require('./light/message-ai-1.webp'),
    dark: require('./light/message-ai-1.webp'),
  },
  'message-balloon-ai-1': {
    light: require('./light/message-balloon-ai-1.webp'),
    dark: require('./light/message-balloon-ai-1.webp'),
  },
  'open-code': {
    light: require('./light/open-code.webp'),
    dark: require('./dark/open-code.webp'),
  },
  'openai-codex': {
    light: require('./light/openai-codex.webp'),
    dark: require('./light/openai-codex.webp'),
  },
  'qoder-cli': {
    light: require('./light/qoder-cli.webp'),
    dark: require('./dark/qoder-cli.webp'),
  },
  'qwen-code': {
    light: require('./light/qwen-code.webp'),
    dark: require('./light/qwen-code.webp'),
  },
  vector: {
    light: require('./light/vector.webp'),
    dark: require('./light/vector.webp'),
  },
} as const satisfies Record<string, IconSource>;

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

export function resolveGeneralIcon(iconId: string): IconSource | undefined {
  if (!iconId) return undefined;

  const icons = GENERAL_ICONS as Record<string, IconSource>;

  return (
    icons[iconId as GeneralIconKey] ??
    icons[toKebabCase(iconId) as GeneralIconKey] ??
    icons[toCamelCase(iconId) as GeneralIconKey]
  );
}
