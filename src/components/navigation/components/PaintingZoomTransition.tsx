import { Link } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';

import { isIOS } from '@/config/constants';

// Apple zoom transition between a gallery thumbnail and the full-screen viewer,
// built on expo-router's public `Link.AppleZoom` / `Link.AppleZoomTarget`. The
// source and target are paired natively — the pushed screen's target binds to
// the zoom source — so no explicit identifier is needed. iOS only; other
// platforms fall back to a plain `Link` with no transition.
export function PaintingZoomLink({
  children,
  fileEntryId,
  paintingId,
}: {
  children: ReactElement;
  fileEntryId: string;
  paintingId: string;
}) {
  const href = {
    pathname: '/paintings/[paintingId]' as const,
    params: { fileEntryId, paintingId },
  };

  if (!isIOS) {
    return (
      <Link asChild href={href}>
        {children}
      </Link>
    );
  }

  return (
    <Link asChild href={href}>
      <Link.AppleZoom>{children}</Link.AppleZoom>
    </Link>
  );
}

export function PaintingZoomTarget({ children }: { children: ReactElement }): ReactNode {
  if (!isIOS) {
    return children;
  }

  return <Link.AppleZoomTarget>{children}</Link.AppleZoomTarget>;
}
