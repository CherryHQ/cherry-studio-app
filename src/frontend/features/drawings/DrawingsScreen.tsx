import { Composer } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/Composer';
import {
  PaintingInputProvider,
  type PaintingInputSubmission,
  PaintingWorkspaceInput,
} from '@/frontend/components/PaintingInput';
import { paintingGenerationInput } from '@/frontend/components/PaintingInput/paintingGenerationInput';
import { SelectionProvider, useSelectionState } from '@/frontend/components/Selection';
import { useStartPaintingGeneration } from '@/frontend/data/paintings/usePaintings';

import { PaintingBoardList } from './components/PaintingBoardList';

/**
 * Drawings home (`/drawings`), the sidebar's paintings destination: templates
 * on top, every board below, and a composer whose first send starts a board.
 */
export function DrawingsScreen() {
  return (
    <SelectionProvider>
      <ComposerSessionProvider>
        <Composer.Expansion>
          <PaintingInputProvider>
            <DrawingsScreenBody />
          </PaintingInputProvider>
        </Composer.Expansion>
      </ComposerSessionProvider>
    </SelectionProvider>
  );
}

function DrawingsScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { left, right } = useSafeAreaInsets();
  const startGeneration = useStartPaintingGeneration();
  const [dockHeight, setDockHeight] = useState(0);
  const { isEditing } = useSelectionState();
  const handleGenerate = useCallback(
    async (input: PaintingInputSubmission) => {
      const started = await startGeneration(paintingGenerationInput(input));
      router.push({ params: { paintingId: started.paintingId }, pathname: '/paintings' });
    },
    [router, startGeneration],
  );

  return (
    <>
      <RouteHeader title={t('navigation.paintings')} />
      {/* Margins, not padding: the dock is absolutely placed and would otherwise reach under a
          side safe area, such as the status bar down an iPhone Duo's trailing edge. */}
      <View className="flex-1" style={{ marginLeft: left, marginRight: right }}>
        <PaintingBoardList bottomInset={dockHeight} />
        <View
          accessibilityElementsHidden={isEditing}
          importantForAccessibility={isEditing ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isEditing ? 'none' : 'box-none'}
          className="absolute inset-0"
          style={{ opacity: isEditing ? 0 : 1 }}
        >
          <ComposerDock layoutMode="expandable" onHeightChange={setDockHeight}>
            <PaintingWorkspaceInput
              onCancel={noop}
              onGenerate={handleGenerate}
              onRatioChange={noop}
              placeholder={t('painting.home.placeholder')}
              status="idle"
            />
          </ComposerDock>
        </View>
      </View>
    </>
  );
}

function noop() {}
