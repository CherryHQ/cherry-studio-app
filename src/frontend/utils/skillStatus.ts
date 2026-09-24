import type { SkillAdmission, SkillAdmissionStatus } from '@/shared/data/types/skill';

export type SkillStatusTone = 'danger' | 'default' | 'success';

/** Visual weight of an admission outcome; copy comes from `skills.status.<status>`. */
export function skillStatusTone(status: SkillAdmissionStatus): SkillStatusTone {
  switch (status) {
    case 'ready':
      return 'success';
    case 'unsupported':
      return 'danger';
    default:
      return 'default';
  }
}

/** The user-facing status for an installed row: the Agent evaluation wins when present. */
export function effectiveSkillStatus(
  admission: SkillAdmission,
  agentAdmission?: SkillAdmission,
): SkillAdmissionStatus {
  return agentAdmission?.status ?? admission.status;
}

/** Settings destinations for repairable reasons; null when the reason has no in-app fix. */
export function skillReasonRoute(code: SkillAdmission['reasons'][number]['code']): string | null {
  switch (code) {
    case 'web-search-unconfigured':
      return '/settings/websearch';
    case 'drawing-model-unconfigured':
      return '/settings/model';
    case 'permission-denied':
      return '/settings/permissions';
    case 'plugin-not-connected':
      return '/plugins';
    default:
      return null;
  }
}

/** Reasons are shown once per code and subject; the Agent list adds Agent-scope reasons after app-scope ones. */
export function mergeSkillReasons(
  admission: SkillAdmission,
  agentAdmission?: SkillAdmission,
): SkillAdmission['reasons'] {
  const seen = new Set<string>();
  return [...admission.reasons, ...(agentAdmission?.reasons ?? [])].filter((reason) => {
    const key = `${reason.code}:${reason.subject ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
