/**
 * Platform-neutral contracts for background activity surfaces (iOS Live
 * Activities today; an Android foreground-service notification later). These
 * types are the only background-activity layer both frontend widget layouts
 * and backend services may import — the lint boundary forbids every direct
 * frontend/backend import, even type-only.
 */

export type BackgroundActivityEndPolicy = 'default' | 'immediate';

/**
 * Base shape of every feature's activity props. The manager injects the
 * resolved app `colorScheme` and `logoUri`, and stamps `finishedAtEpochMs`
 * when a session finishes; features own everything else.
 */
export type BackgroundActivityBaseProps = {
  /** Resolved app theme injected by BackgroundActivityManager. */
  colorScheme?: 'dark' | 'light';
  finishedAtEpochMs?: number;
  logoUri?: string;
  startedAtEpochMs: number;
};
