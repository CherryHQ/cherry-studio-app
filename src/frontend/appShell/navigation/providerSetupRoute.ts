import { getSingleRouteParam } from '@/frontend/utils/routeParams';

const INTERNAL_HREF_PATTERN = /^\/(?!\/)[A-Za-z0-9()[\]_.~/-]*(?:\?[A-Za-z0-9%&=+_.~-]*)?$/;

export type ProviderSetupRouteParamsInput = {
  returnTo?: string | string[];
};

/** Opt-in for dedicated first-use route adapters, not an ordinary settings URL parameter. */
export type ProviderSetupIntent = 'chat';

/** Day-to-day provider setup never enters the first-use onboarding stack. */
export function providerSetupHref(returnTo: string) {
  return {
    params: { returnTo },
    pathname: '/settings/provider/catalog' as const,
  };
}

/** Accepts internal hrefs only; schemes, protocol-relative URLs, and fragments fail closed. */
export function readProviderSetupReturnTo(
  value: ProviderSetupRouteParamsInput['returnTo'],
): string | undefined {
  const returnTo = getSingleRouteParam(value)?.trim();
  return returnTo && INTERNAL_HREF_PATTERN.test(returnTo) ? returnTo : undefined;
}
