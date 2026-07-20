/**
 * Auto-generated model icon registry
 * Do not edit manually.
 *
 * Total icons: 36
 */

import { MODEL_ID_ALIASES } from '../model-aliases';

import type { IconPngSource } from '../types';

export const MODEL_ICONS = {
  aya: {
    light: require('./light/aya.png'),
    dark: require('./light/aya.png'),
  },
  claude: {
    light: require('./light/claude.png'),
    dark: require('./light/claude.png'),
  },
  codegeex: {
    light: require('./light/codegeex.png'),
    dark: require('./light/codegeex.png'),
  },
  doubao: {
    light: require('./light/doubao.png'),
    dark: require('./light/doubao.png'),
  },
  gemini: {
    light: require('./light/gemini.png'),
    dark: require('./light/gemini.png'),
  },
  gemma: {
    light: require('./light/gemma.png'),
    dark: require('./light/gemma.png'),
  },
  glm: {
    light: require('./light/glm.png'),
    dark: require('./light/glm.png'),
  },
  'gpt-5-1-chat': {
    light: require('./light/gpt-5-1-chat.png'),
    dark: require('./light/gpt-5-1-chat.png'),
  },
  'gpt-5-1-codex-mini': {
    light: require('./light/gpt-5-1-codex-mini.png'),
    dark: require('./light/gpt-5-1-codex-mini.png'),
  },
  'gpt-5-1-codex': {
    light: require('./light/gpt-5-1-codex.png'),
    dark: require('./light/gpt-5-1-codex.png'),
  },
  'gpt-5-1': {
    light: require('./light/gpt-5-1.png'),
    dark: require('./light/gpt-5-1.png'),
  },
  'gpt-5-2-pro': {
    light: require('./light/gpt-5-2-pro.png'),
    dark: require('./light/gpt-5-2-pro.png'),
  },
  'gpt-5-2': {
    light: require('./light/gpt-5-2.png'),
    dark: require('./light/gpt-5-2.png'),
  },
  'gpt-5-chat': {
    light: require('./light/gpt-5-chat.png'),
    dark: require('./light/gpt-5-chat.png'),
  },
  'gpt-5-codex': {
    light: require('./light/gpt-5-codex.png'),
    dark: require('./light/gpt-5-codex.png'),
  },
  'gpt-5-mini': {
    light: require('./light/gpt-5-mini.png'),
    dark: require('./light/gpt-5-mini.png'),
  },
  'gpt-5-nano': {
    light: require('./light/gpt-5-nano.png'),
    dark: require('./light/gpt-5-nano.png'),
  },
  'gpt-5': {
    light: require('./light/gpt-5.png'),
    dark: require('./light/gpt-5.png'),
  },
  'gpt-image-1-5': {
    light: require('./light/gpt-image-1-5.png'),
    dark: require('./light/gpt-image-1-5.png'),
  },
  'gpt-image-1': {
    light: require('./light/gpt-image-1.png'),
    dark: require('./light/gpt-image-1.png'),
  },
  'gpt-oss-120b': {
    light: require('./light/gpt-oss-120b.png'),
    dark: require('./light/gpt-oss-120b.png'),
  },
  'gpt-oss-20b': {
    light: require('./light/gpt-oss-20b.png'),
    dark: require('./light/gpt-oss-20b.png'),
  },
  grok: {
    light: require('./light/grok.png'),
    dark: require('./dark/grok.png'),
  },
  hailuo: {
    light: require('./light/hailuo.png'),
    dark: require('./light/hailuo.png'),
  },
  happyhorse: {
    light: require('./light/happyhorse.png'),
    dark: require('./dark/happyhorse.png'),
  },
  hunyuan: {
    light: require('./light/hunyuan.png'),
    dark: require('./light/hunyuan.png'),
  },
  ibm: {
    light: require('./light/ibm.png'),
    dark: require('./light/ibm.png'),
  },
  kimi: {
    light: require('./light/kimi.png'),
    dark: require('./dark/kimi.png'),
  },
  ling: {
    light: require('./light/ling.png'),
    dark: require('./light/ling.png'),
  },
  mimo: {
    light: require('./light/mimo.png'),
    dark: require('./dark/mimo.png'),
  },
  nova: {
    light: require('./light/nova.png'),
    dark: require('./light/nova.png'),
  },
  palm: {
    light: require('./light/palm.png'),
    dark: require('./light/palm.png'),
  },
  qwen: {
    light: require('./light/qwen.png'),
    dark: require('./light/qwen.png'),
  },
  sensenova: {
    light: require('./light/sensenova.png'),
    dark: require('./light/sensenova.png'),
  },
  sora: {
    light: require('./light/sora.png'),
    dark: require('./light/sora.png'),
  },
  trinity: {
    light: require('./light/trinity.png'),
    dark: require('./dark/trinity.png'),
  },
} as const satisfies Record<string, IconPngSource>;

export type ModelIconKey = keyof typeof MODEL_ICONS;

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

export function resolveModelAssetIcon(iconId: string): IconPngSource | undefined {
  if (!iconId) return undefined;

  const key = MODEL_ID_ALIASES[iconId] ?? iconId;
  const icons = MODEL_ICONS as Record<string, IconPngSource>;

  return (
    icons[key as ModelIconKey] ??
    icons[toKebabCase(key) as ModelIconKey] ??
    icons[toCamelCase(key) as ModelIconKey]
  );
}
export const resolveModelIconAsset = resolveModelAssetIcon;
