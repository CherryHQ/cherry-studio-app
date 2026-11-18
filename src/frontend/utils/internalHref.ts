import { getSingleRouteParam } from './routeParams';

const INTERNAL_HREF_PATTERN = /^\/(?!\/)[A-Za-z0-9()[\]_.~/-]*(?:\?[A-Za-z0-9%&=+_.~-]*)?$/;

/** Accepts app destinations only; schemes, protocol-relative URLs and fragments fail closed. */
export function readInternalHref(
  value: string | readonly string[] | undefined,
): string | undefined {
  const href = getSingleRouteParam(value)?.trim();
  if (!href || !INTERNAL_HREF_PATTERN.test(href)) return undefined;
  const pathname = href.split('?')[0];
  return pathname.split('/').some((segment) => segment === '.' || segment === '..')
    ? undefined
    : href;
}
