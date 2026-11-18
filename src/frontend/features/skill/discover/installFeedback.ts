import {
  isSkillsError,
  type SkillInspection,
  type SkillsErrorCode,
} from '@/shared/contracts/skills';
import type { SkillPackageIssue } from '@/shared/data/types/skill';

type ErrorKey = `skills.error.${SkillsErrorCode}`;
type FeedbackReason = {
  key: ErrorKey | `skills.issue.${SkillPackageIssue['code']}` | 'skills.candidate.invalidPackage';
  params: Record<string, string>;
};

// Expose only existing locale keys; untranslated or unknown codes use the source fallback.
const ERROR_KEYS: Partial<Record<SkillsErrorCode, ErrorKey>> = {
  'search-unavailable': 'skills.error.search-unavailable',
  'candidate-expired': 'skills.error.candidate-expired',
  'source-invalid': 'skills.error.source-invalid',
  'source-unreachable': 'skills.error.source-unreachable',
  'package-invalid': 'skills.error.package-invalid',
  'package-too-large': 'skills.error.package-too-large',
  'admission-unsupported': 'skills.error.admission-unsupported',
  'already-installed': 'skills.error.already-installed',
  'not-found': 'skills.error.not-found',
};

export function errorCode(error: unknown): SkillsErrorCode {
  return isSkillsError(error) && Object.hasOwn(ERROR_KEYS, error.code)
    ? error.code
    : 'source-unreachable';
}

export function firstIssueReason(issues: readonly SkillPackageIssue[]): FeedbackReason | null {
  const issue = issues[0];
  return issue
    ? { key: `skills.issue.${issue.code}`, params: { subject: issue.subject ?? '' } }
    : null;
}

export function resolveFooterNotice({
  inspections,
  isCollection,
  operationError,
}: {
  inspections: readonly SkillInspection[] | null;
  isCollection: boolean;
  operationError: SkillsErrorCode | null;
}): FeedbackReason | null {
  if (inspections?.length && inspections.every((item) => item.package === null)) {
    if (!isCollection && inspections.length === 1) {
      return (
        firstIssueReason(inspections[0]!.issues) ?? {
          key: 'skills.candidate.invalidPackage',
          params: {},
        }
      );
    }
    if (isCollection) return { key: 'skills.candidate.invalidPackage', params: {} };
  }
  return operationError
    ? {
        key: ERROR_KEYS[operationError] ?? 'skills.error.source-unreachable',
        params: {},
      }
    : null;
}

export function planInstallTargets({
  inspections,
  selected,
  isInstalled,
  isInstallable,
}: {
  inspections: readonly SkillInspection[] | null;
  selected: ReadonlySet<string>;
  isInstalled: (item: SkillInspection) => boolean;
  isInstallable: (item: SkillInspection) => boolean;
}): SkillInspection[] {
  return (
    inspections?.filter(
      (item) =>
        selected.has(item.candidate.candidateId) && isInstallable(item) && !isInstalled(item),
    ) ?? []
  );
}

export function describeInstallOutcome({
  installed,
  failed,
  expired,
}: {
  installed: number;
  failed: number;
  expired: boolean;
}) {
  return {
    key: 'skills.marketplace.installResult' as const,
    params: { installed, failed },
    reason: expired ? ('skills.error.candidate-expired' as const) : null,
  };
}

export function formatInstallOutcome(
  outcome: ReturnType<typeof describeInstallOutcome>,
  translate: (
    key: typeof outcome.key | NonNullable<typeof outcome.reason>,
    params?: typeof outcome.params,
  ) => string,
): string {
  const result = translate(outcome.key, outcome.params);
  return outcome.reason ? [result, translate(outcome.reason)].join('\n') : result;
}
