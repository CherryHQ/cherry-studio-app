import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import {
  consumePaintingDraftHandoff,
  createPaintingDraftHandoff,
  type PaintingDraftHandoff,
} from '@/frontend/utils/paintingDraftHandoff';

/** One admission owner for the gallery header, templates, and photos. */
export function useOpenPainting() {
  const navigation = useNavigation();
  const router = useRouter();
  const pending = useRef(false);
  useFocusEffect(
    useCallback(
      () => () => {
        pending.current = false;
      },
      [],
    ),
  );

  return useCallback(
    (payload?: PaintingDraftHandoff) => {
      // Expo queues push before focus changes; block the next event synchronously.
      if (!navigation.isFocused() || pending.current) return;
      pending.current = true;
      let handoff: string | undefined;
      try {
        if (payload) {
          handoff = createPaintingDraftHandoff(payload);
          router.push({ pathname: '/paintings', params: { handoff } });
        } else {
          router.push('/paintings');
        }
      } catch (error) {
        consumePaintingDraftHandoff(handoff);
        pending.current = false;
        throw error;
      }
    },
    [navigation, router],
  );
}
