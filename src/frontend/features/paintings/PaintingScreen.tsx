/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/appShell/header';
import { usePainting } from '@/frontend/data/paintings/usePaintings';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { PaintingBoardWorkspace } from './components/PaintingBoardWorkspace';

/**
 * `/paintings` opens a painting board. A `boardId` (gallery card) opens the
 * board where the user last left it; a `paintingId` (task notification, file
 * library) opens its board focused on that painting, with `fileEntryId`
 * choosing one of its images; neither starts a new board.
 */
export function PaintingScreen() {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const router = useRouter();
  // Screen-scoped rather than `router.setParams`: the receipt can land after
  // the user has already navigated away, and the router's version would write
  // into whatever route is focused by then.
  const navigation = useNavigation<{
    setParams(params: {
      boardId: undefined;
      fileEntryId: undefined;
      paintingId: string | undefined;
    }): void;
  }>();
  const params = useLocalSearchParams<{
    boardId?: string | string[];
    fileEntryId?: string | string[];
    paintingId?: string | string[];
  }>();
  // Only the opening painting locates the board; later receipts rewrite the
  // route for task identity without re-entering this gate.
  const [opening] = useState(() => getSingleRouteParam(params.paintingId));
  const [initialFileEntryId] = useState(() => getSingleRouteParam(params.fileEntryId));
  const [openingBoardId, setOpeningBoardId] = useState(() => getSingleRouteParam(params.boardId));
  const paintingQuery = usePainting(openingBoardId ? undefined : opening);
  // Once located, the board outlives the opening painting, which may be deleted on this page.
  if (!openingBoardId && paintingQuery.data) setOpeningBoardId(paintingQuery.data.boardId);
  const foreground = useThemeColor('foreground');
  const handleReceipt = useCallback(
    (paintingId: string | undefined) =>
      navigation.setParams({ boardId: undefined, fileEntryId: undefined, paintingId }),
    [navigation],
  );
  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/drawings');
  }, [router]);

  let content;
  if (opening && !openingBoardId) {
    content = paintingQuery.isLoading ? (
      <View className="flex-1 items-center justify-center">
        <Spinner
          accessibilityLabel={t('painting.board.loading')}
          accessibilityRole="progressbar"
          color={foreground}
        />
      </View>
    ) : (
      <>
        <RouteHeader onBack={close} />
        <View className="flex-1 justify-center px-8 py-16">
          <ContentState.Error
            description={t('painting.board.unavailableDescription')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void paintingQuery.refetch(),
            }}
            prominence="prominent"
            secondaryAction={{ children: t('common.back'), onPress: close }}
            title={t('painting.board.unavailable')}
          />
        </View>
      </>
    );
  } else {
    content = (
      <PaintingBoardWorkspace
        boardId={openingBoardId}
        initialFocus={
          opening ? { fileEntryId: initialFileEntryId, paintingId: opening } : undefined
        }
        onClose={close}
        onReceipt={handleReceipt}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {content}
    </View>
  );
}
