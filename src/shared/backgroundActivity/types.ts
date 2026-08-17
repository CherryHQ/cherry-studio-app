import type { BackgroundActivityBasePresentation } from '@cherrystudio/ui/background-activity';

/** Platform-neutral contracts for background activity surfaces. */

export type BackgroundActivityEndPolicy = 'default' | 'immediate';

/**
 * Base shape of every feature's activity props. The manager injects the
 * resolved app `colorScheme` and `logoUri`, and stamps `finishedAtEpochMs`
 * when a session finishes; features own everything else.
 */
export type BackgroundActivityBaseProps = BackgroundActivityBasePresentation;
