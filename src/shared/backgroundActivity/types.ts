import type { BackgroundActivityBasePresentation } from '@cherrystudio/ui/background-activity';

/** Platform-neutral contracts for background activity surfaces. */

export const BACKGROUND_NOTIFICATION_OWNER = 'cherry-background-activity';

export type BackgroundActivityEndPolicy = 'default' | 'immediate';

/**
 * How long a settled surface may remain visible after its session ends. The
 * platform retires it on its own after this window; the manager only keeps a
 * settled surface dismissable for the same period.
 */
export const BACKGROUND_ACTIVITY_LINGER_MS = 30 * 60_000;

/**
 * Base shape of every feature's activity props. The manager injects the
 * resolved app `colorScheme` and `logoUri`, and stamps `finishedAtEpochMs`
 * when a session finishes; features own everything else.
 */
export type BackgroundActivityBaseProps = BackgroundActivityBasePresentation & {
  /** Opaque domain phase; its entry time determines foreground notification policy. */
  phase?: string;
};
