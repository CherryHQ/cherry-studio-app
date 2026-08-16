import type {
  BackgroundActivityBaseProps,
  BackgroundActivityEndPolicy,
} from '@/shared/backgroundActivity/types';

// NOTE: method-shorthand signatures keep these types bivariant under
// strictFunctionTypes, so a Presenter<FeatureProps> stays assignable to the
// type-erased Presenter the manager stores (same trick as JobHandler).
export type BackgroundActivityHandle<Props extends BackgroundActivityBaseProps> = {
  end(policy: BackgroundActivityEndPolicy, props: Props): Promise<void>;
  update(props: Props): Promise<void>;
};

/**
 * Platform adapter for one feature's background surface. iOS wraps an
 * expo-widgets Live Activity factory; platforms without a surface use the
 * no-op presenter so sessions degrade gracefully.
 */
export type BackgroundActivityPresenter<Props extends BackgroundActivityBaseProps> = {
  /** Ends every surface a previous process left behind; returns the count. */
  clearOrphans(): Promise<number>;
  start(props: Props, deepLinkUrl?: string): BackgroundActivityHandle<Props>;
};

export function noopBackgroundActivityPresenter<
  Props extends BackgroundActivityBaseProps,
>(): BackgroundActivityPresenter<Props> {
  return {
    clearOrphans: async () => 0,
    start: () => ({ end: async () => {}, update: async () => {} }),
  };
}
