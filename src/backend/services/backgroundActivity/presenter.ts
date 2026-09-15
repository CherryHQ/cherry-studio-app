import type {
  BackgroundActivityBaseProps,
  BackgroundActivityEndPolicy,
} from '@/shared/backgroundActivity/types';

// NOTE: method-shorthand signatures keep these types bivariant under
// strictFunctionTypes, so a Presenter<FeatureProps> stays assignable to the
// type-erased Presenter the manager stores (same trick as JobHandler).
export type BackgroundActivityHandle<Props extends BackgroundActivityBaseProps> = {
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
 * Platform adapter for one feature's background surface. The adapter declares
 * its admission and delivery requirements; the manager owns their sequencing.
 * These requirements concern presentation, not permission to start domain work.
 */
export type BackgroundActivityPresenter<Props extends BackgroundActivityBaseProps> = {
  /** Whether a surface can start before the app returns to the foreground. */
  readonly canStartInBackground: boolean;
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
    canStartInBackground: true,
    shouldHoldLeaseUntilDelivery: false,
    clearOrphans: async () => 0,
    start: () => ({ end: async () => {}, update: async () => {} }),
  };
}
