import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { type RefObject, useEffect, useRef } from 'react';

import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import type { FilePaneFile } from './FilePaneProvider';

type CarriedPreview = {
  file: FilePaneFile;
  originKey: string;
  routeKey?: string;
};

/** A resize temporarily opens the active preview; later navigation always belongs to the user. */
export function useCarriedFilePreview({
  file,
  isAvailable,
  isLayoutCurrent,
  isLocal,
  isOpen,
  lastTouched,
}: {
  file: FilePaneFile | null;
  isAvailable: boolean;
  isLayoutCurrent: boolean;
  isLocal: boolean;
  isOpen: boolean;
  lastTouched: RefObject<'pane' | 'chat'>;
}) {
  const router = useRouter();
  const top = useNavigationState((state) => state.routes[state.index]);
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const wasAvailable = useRef(isAvailable);
  const carried = useRef<CarriedPreview | null>(null);

  useEffect(() => {
    const becameUnavailable = isLayoutCurrent && wasAvailable.current && !isAvailable;
    if (isLayoutCurrent) wasAvailable.current = isAvailable;
    const pending = carried.current;

    if (pending && top) {
      const routeParams = top.params as
        | {
            fileEntryId?: string;
            imageEditRequestId?: string;
            carriedFromPane?: string;
          }
        | undefined;
      const isCarriedPreview =
        top.name === 'files/[fileEntryId]' &&
        getSingleRouteParam(routeParams?.carriedFromPane) === '1' &&
        getSingleRouteParam(routeParams?.fileEntryId) === pending.file.entryId &&
        getSingleRouteParam(routeParams?.imageEditRequestId) === pending.file.imageEditRequestId &&
        (!pending.routeKey || pending.routeKey === top.key);
      if (isCarriedPreview) {
        pending.routeKey = top.key;
        if (isAvailable && isLayoutCurrent) {
          carried.current = null;
          router.back();
        }
      } else if (pending.routeKey || top.key !== pending.originKey) {
        // Even returning to this file later must not revive automatic dismissal.
        carried.current = null;
      }
      // If the resize reverses before push commits, wait for that page, then return it above.
    }

    if (
      becameUnavailable &&
      isLocal &&
      isOpen &&
      file &&
      lastTouched.current === 'pane' &&
      top?.name === '(drawer)'
    ) {
      carried.current = { file, originKey: top.key };
      const chat = parseChatRoute(params);
      router.push({
        pathname: '/files/[fileEntryId]',
        params: {
          fileEntryId: file.entryId,
          ...(file.imageEditRequestId ? { imageEditRequestId: file.imageEditRequestId } : {}),
          ...(chat.status === 'ready'
            ? { sourceChat: JSON.stringify(chatRouteParams(chat.target)) }
            : {}),
          carriedFromPane: '1',
        },
      });
    }
  }, [file, isAvailable, isLayoutCurrent, isLocal, isOpen, lastTouched, top, params, router]);
}
