import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getComposerKeyboardStickyOffset } from '@/frontend/components/composer/utils/composerLayout';

import { usePaintingGeneration } from '../hooks/usePaintingGeneration';
import { paintingJobParamValues, usePaintingJobs } from '../hooks/usePaintingJobs';
import type { ResolvedPaintingFiles } from '../hooks/usePaintings';
import { PaintingCanvas } from './PaintingCanvas';
import { PaintingInput } from './PaintingInput';

export function PaintingComposer({
  initialFiles,
  onReceipt,
  painting,
}: {
  initialFiles: ResolvedPaintingFiles;
  onReceipt?: (paintingId: string | undefined) => void;
  painting?: Painting;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardInputOffset = getComposerKeyboardStickyOffset(bottom);
  // Only an image-less receipt is this screen's to adopt or retry. One that
  // already holds images is a source to work from (edit / resize), so a
  // generation started here must mint its own painting instead.
  const receiptId = painting && painting.files.output.length === 0 ? painting.id : undefined;
  const generation = usePaintingGeneration({
    initialOutputs: initialFiles.outputs,
    onReceipt,
    paintingId: receiptId,
  });
  // Size, image count and the rest of a retried attempt live only in the job's
  // input — the painting row never carried them.
  const jobs = usePaintingJobs();
  const initialParamValues = receiptId
    ? paintingJobParamValues(
        jobs.activeByPaintingId.get(receiptId) ?? jobs.interruptedByPaintingId.get(receiptId),
      )
    : undefined;

  return (
    <View className="flex-1 bg-background">
      <PaintingCanvas
        error={generation.error}
        interruption={generation.interruption}
        onRevealFinish={generation.finishReveal}
        outputs={generation.outputs}
        status={generation.status}
      />
      <KeyboardStickyView offset={{ opened: keyboardInputOffset }}>
        <View className="px-3 pb-2" testID="painting-composer">
          <PaintingInput
            initialParamValues={initialParamValues}
            onCancel={generation.cancel}
            onGenerate={generation.generate}
            painting={painting}
            status={generation.status}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
