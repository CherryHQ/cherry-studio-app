import { reorderLocally } from '@/shared/utils/reorder';

export const ASSISTANT_MESSAGE_ACTION_IDS = [
  'copy',
  'readAloud',
  'retry',
  'answerWith',
  'fork',
  'edit',
  'translate',
  'share',
  'delete',
] as const;
export type AssistantMessageActionId = (typeof ASSISTANT_MESSAGE_ACTION_IDS)[number];
export const ASSISTANT_TOOLBAR_MAX_PINNED = 5;
export const ASSISTANT_TOOLBAR_LOCKED_OVERFLOW_IDS = ['delete'] as const;
export type AssistantMessageToolbarConfig = {
  pinned: AssistantMessageActionId[];
  overflow: AssistantMessageActionId[];
};
export const DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG: AssistantMessageToolbarConfig = {
  pinned: ['copy', 'readAloud', 'retry', 'answerWith', 'fork'],
  overflow: ['edit', 'translate', 'share', 'delete'],
};

export function isLockedOverflowAction(id: AssistantMessageActionId): boolean {
  return ASSISTANT_TOOLBAR_LOCKED_OVERFLOW_IDS.some((lockedId) => lockedId === id);
}

export function normalizeAssistantMessageToolbarConfig(
  raw: unknown,
): AssistantMessageToolbarConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG;
  }
  const input = raw as Record<string, unknown>;
  const seen = new Set<AssistantMessageActionId>();
  const readZone = (value: unknown): AssistantMessageActionId[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is AssistantMessageActionId => {
      if (
        typeof id !== 'string' ||
        !ASSISTANT_MESSAGE_ACTION_IDS.some((knownId) => knownId === id) ||
        isLockedOverflowAction(id as AssistantMessageActionId) ||
        seen.has(id as AssistantMessageActionId)
      ) {
        return false;
      }
      seen.add(id as AssistantMessageActionId);
      return true;
    });
  };
  const pinned = readZone(input.pinned);
  const overflow = [
    ...pinned.splice(ASSISTANT_TOOLBAR_MAX_PINNED),
    ...readZone(input.overflow),
    ...ASSISTANT_MESSAGE_ACTION_IDS.filter((id) => !seen.has(id) && !isLockedOverflowAction(id)),
    ...ASSISTANT_TOOLBAR_LOCKED_OVERFLOW_IDS,
  ];
  // Preference snapshots must keep their identity until the stored value changes.
  if (
    Array.isArray(input.pinned) &&
    input.pinned.length === pinned.length &&
    input.pinned.every((id, index) => id === pinned[index]) &&
    Array.isArray(input.overflow) &&
    input.overflow.length === overflow.length &&
    input.overflow.every((id, index) => id === overflow[index])
  ) {
    return raw as AssistantMessageToolbarConfig;
  }
  return { pinned, overflow };
}

export function pinAssistantToolbarAction(
  config: AssistantMessageToolbarConfig,
  id: AssistantMessageActionId,
): AssistantMessageToolbarConfig {
  const next = normalizeAssistantMessageToolbarConfig(config);
  if (
    isLockedOverflowAction(id) ||
    next.pinned.length >= ASSISTANT_TOOLBAR_MAX_PINNED ||
    !next.overflow.includes(id)
  ) {
    return next;
  }
  return { pinned: [...next.pinned, id], overflow: next.overflow.filter((item) => item !== id) };
}

export function unpinAssistantToolbarAction(
  config: AssistantMessageToolbarConfig,
  id: AssistantMessageActionId,
): AssistantMessageToolbarConfig {
  const next = normalizeAssistantMessageToolbarConfig(config);
  if (!next.pinned.includes(id)) return next;
  return { pinned: next.pinned.filter((item) => item !== id), overflow: [id, ...next.overflow] };
}

export function reorderAssistantToolbarZone(
  config: AssistantMessageToolbarConfig,
  zone: 'pinned' | 'overflow',
  fromIndex: number,
  toIndex: number,
): AssistantMessageToolbarConfig {
  const next = normalizeAssistantMessageToolbarConfig(config);
  const movable = next[zone].filter((id) => !isLockedOverflowAction(id));
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= movable.length ||
    toIndex >= movable.length
  ) {
    return next;
  }
  const reordered = reorderLocally(movable, fromIndex, toIndex);
  return {
    ...next,
    [zone]:
      zone === 'overflow' ? [...reordered, ...ASSISTANT_TOOLBAR_LOCKED_OVERFLOW_IDS] : reordered,
  };
}
