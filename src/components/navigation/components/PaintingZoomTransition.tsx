import { Link } from 'expo-router';
import {
  LinkZoomTransitionAlignmentRectDetector,
  LinkZoomTransitionSource,
} from 'expo-router/build/link/preview/native';
import { Slot } from 'expo-router/build/ui/Slot';
import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';

import { isIOS } from '@/config/constants';

export const paintingZoomTransitionSourceIdParam =
  '__internal_expo_router_zoom_transition_source_id';

export function getPaintingZoomTransitionSourceId(sourceKey: string): string {
  return `painting-gallery:${sourceKey}`;
}

export function PaintingZoomLink({
  children,
  fileEntryId,
  paintingId,
  sourceKey,
}: {
  children: ReactElement;
  fileEntryId: string;
  paintingId: string;
  sourceKey: string;
}) {
  const identifier = getPaintingZoomTransitionSourceId(sourceKey);
  const href = {
    pathname: '/paintings/[paintingId]' as const,
    params: {
      fileEntryId,
      paintingId,
      ...(isIOS ? { [paintingZoomTransitionSourceIdParam]: identifier } : {}),
    },
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
      <PaintingZoomSource identifier={identifier}>{children}</PaintingZoomSource>
    </Link>
  );
}

export function PaintingZoomTarget({
  children,
  sourceKey,
}: {
  children: ReactElement;
  sourceKey: string;
}) {
  if (!isIOS) {
    return children;
  }

  const identifier = getPaintingZoomTransitionSourceId(sourceKey);
  return (
    <LinkZoomTransitionAlignmentRectDetector identifier={identifier}>
      {children}
    </LinkZoomTransitionAlignmentRectDetector>
  );
}

function PaintingZoomSource({
  children,
  identifier,
  ...linkProps
}: ViewProps & { children: ReactElement; identifier: string }) {
  return (
    <LinkZoomTransitionSource animateAspectRatioChange identifier={identifier}>
      <Slot {...linkProps}>{children}</Slot>
    </LinkZoomTransitionSource>
  );
}
