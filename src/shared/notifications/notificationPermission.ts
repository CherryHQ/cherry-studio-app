/**
 * Notification permission predicate shared by the Settings surface and the
 * delivery path so both agree on what "allowed" means.
 *
 * Structurally typed: `expo-notifications` stays a consumer-side dependency,
 * so shared code never imports it. The iOS status numbers mirror
 * `IosAuthorizationStatus` (AUTHORIZED = 2, PROVISIONAL = 3, EPHEMERAL = 4).
 */

/** Structural subset of `NotificationPermissionsStatus` this module reads. */
export type NotificationPermissionStatusLike = {
  canAskAgain: boolean;
  granted: boolean;
  ios?: { status?: number };
};

/** expo-notifications `IosAuthorizationStatus.PROVISIONAL`. */
const IOS_PROVISIONAL_STATUS = 3;
/** expo-notifications `IosAuthorizationStatus.EPHEMERAL`. */
const IOS_EPHEMERAL_STATUS = 4;

/** iOS can also deliver under provisional or ephemeral authorization. */
export function isNotificationAllowed(status: NotificationPermissionStatusLike): boolean {
  const iosStatus = status.ios?.status;
  return (
    status.granted || iosStatus === IOS_PROVISIONAL_STATUS || iosStatus === IOS_EPHEMERAL_STATUS
  );
}

/** Only a hard denial (undeliverable and unpromptable) offers the recovery row. */
export function isNotificationBlocked(status: NotificationPermissionStatusLike): boolean {
  return !isNotificationAllowed(status) && !status.canAskAgain;
}
