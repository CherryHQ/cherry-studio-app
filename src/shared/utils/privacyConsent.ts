/**
 * Data-collection consent, mirroring desktop's `LATEST_PRIVACY_POLICY_VERSION`
 * plus `src/main/utils/privacyConsent.ts`.
 *
 * Every uploader gates on the one predicate below, so bumping the policy version
 * revokes them all together until the user acknowledges the new disclosure.
 */

/**
 * The disclosure the app currently presents. It matches the version the native
 * crash-reporting module persists (`modules/crash-reporting/reportingPolicy.json`),
 * so one disclosure covers both uploaders rather than two dates drifting apart.
 */
export const LATEST_PRIVACY_POLICY_VERSION = '20260915';

/** Whether the user consented to data collection **under the current policy**. */
export function isDataCollectionConsented(enabled: boolean, policyVersion: string): boolean {
  return enabled && policyVersion === LATEST_PRIVACY_POLICY_VERSION;
}
