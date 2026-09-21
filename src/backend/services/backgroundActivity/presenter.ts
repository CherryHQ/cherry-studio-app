import type {
  BackgroundActivityBaseProps,
  BackgroundActivityEndPolicy,
} from '@/shared/backgroundActivity/types';

// NOTE: method-shorthand signatures keep these types bivariant under
// strictFunctionTypes, so a Presenter<FeatureProps> stays assignable to the
// type-erased Presenter the manager stores (same trick as JobHandler).
export type BackgroundActivityHandle<Props extends BackgroundActivityBaseProps> = {
  /** Optional native-state check; false means the user or system removed the surface. */
  isActive?(): boolean;
  /**
   * Retires a surface the user has already seen. Called at most once, after
   * `end`, while the ended surface may still be visible.
   */
  dismiss(): Promise<void>;
  end(
    policy: BackgroundActivityEndPolicy,
    props: Props,
    context?: BackgroundActivityDeliveryContext,
  ): Promise<void>;
  update(props: Props, context?: BackgroundActivityDeliveryContext): Promise<void>;
};

export type BackgroundActivityDeliveryContext = {
  /** Captured before the manager's queue/throttle, preserved through same-phase title updates. */
  phaseStartedInBackground: boolean;
};

/**
 * When a surface is allowed to exist. `always` represents work regardless of
 * what the user is looking at; `app-hidden` only speaks for the time the user
 * cannot see the app, so the manager creates it as the app leaves the
 * foreground and retires it as soon as the app comes back.
 */
export type BackgroundActivityPresentationWindow = 'always' | 'app-hidden';

/**
 * Platform adapter for one feature's background surface. The adapter declares
 * its admission and delivery requirements; the manager owns their sequencing.
 * These requirements concern presentation, not permission to start domain work.
 */
export type BackgroundActivityPresenter<Props extends BackgroundActivityBaseProps> = {
  /** The window during which this surface may exist. */
  readonly presentWhile: BackgroundActivityPresentationWindow;
  /** Keep the session's existing lease until its latest update/end has settled. */
  readonly shouldHoldLeaseUntilDelivery: boolean;
  /** Ends every surface a previous process left behind; returns the count. */
  clearOrphans(): Promise<number>;
  start(props: Props, deepLinkUrl?: string): BackgroundActivityHandle<Props>;
};

export function noopBackgroundActivityPresenter<
  Props extends BackgroundActivityBaseProps,
>(): BackgroundActivityPresenter<Props> {
  return {
    presentWhile: 'always',
    shouldHoldLeaseUntilDelivery: false,
    clearOrphans: async () => 0,
    start: () => ({ dismiss: async () => {}, end: async () => {}, update: async () => {} }),
  };
}
