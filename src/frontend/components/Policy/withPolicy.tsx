import type { ComponentType } from 'react';

import {
  type EditionCapabilities,
  editionCapabilities,
  type ResourcePolicy,
} from '@/shared/data/managedPolicy';

import { PolicyScope, usePolicy } from './PolicyScope';

function nameOf(Component: { displayName?: string; name?: string }) {
  return Component.displayName ?? Component.name;
}

/**
 * Applies the enclosing policy to a component through its ordinary props: `toProps` returns the
 * props to override, or null to render nothing. The component itself stays policy-free.
 */
export function withPolicy<P extends object>(
  Component: ComponentType<P>,
  toProps: (policy: ResourcePolicy, props: P) => Partial<P> | null,
): ComponentType<P> {
  function WithPolicy(props: P) {
    const overrides = toProps(usePolicy(), props);
    return overrides === null ? null : <Component {...props} {...overrides} />;
  }
  WithPolicy.displayName = `withPolicy(${nameOf(Component)})`;
  return WithPolicy;
}

/** Gives a component its own resource's policy, such as one row of a list. */
export function withResourcePolicy<P extends object>(
  Component: ComponentType<P>,
  policyOf: (props: P) => ResourcePolicy,
): ComponentType<P> {
  function WithResourcePolicy(props: P) {
    return (
      <PolicyScope policy={policyOf(props)}>
        <Component {...props} />
      </PolicyScope>
    );
  }
  WithResourcePolicy.displayName = `withResourcePolicy(${nameOf(Component)})`;
  return WithResourcePolicy;
}

/** Renders a component only when the profile allows `capability`; `Otherwise` takes its place. */
export function withCapability<P extends object>(
  capability: keyof EditionCapabilities,
  Component: ComponentType<P>,
  Otherwise?: ComponentType<P>,
): ComponentType<P> {
  function WithCapability(props: P) {
    if (editionCapabilities()[capability]) return <Component {...props} />;
    return Otherwise ? <Otherwise {...props} /> : null;
  }
  WithCapability.displayName = `withCapability(${capability}, ${nameOf(Component)})`;
  return WithCapability;
}
