import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatInputKeyboardStickyOffset } from '@/frontend/features/chat/input/chatInputLayout';
import type { Painting } from '@/shared/data/types/painting';
import { usePaintingGeneration } from '../hooks/usePaintingGeneration';
import type { ResolvedPaintingFiles } from '../hooks/usePaintings';
import { PaintingCanvas } from './PaintingCanvas';
import { PaintingInput } from './PaintingInput';

export function PaintingComposer({
  initialFiles,
  painting,
}: {
  initialFiles: ResolvedPaintingFiles;
  painting?: Painting;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardInputOffset = getChatInputKeyboardStickyOffset(bottom);
  const generation = usePaintingGeneration({
    initialOutputs: initialFiles.outputs,
  });

  return (
    <View className="flex-1 bg-background">
      <PaintingCanvas
        error={generation.error}
        onRevealFinish={generation.finishReveal}
        outputs={generation.outputs}
        status={generation.status}
      />
      <KeyboardStickyView offset={{ opened: keyboardInputOffset }}>
        <View className="px-3 pb-2" testID="painting-composer">
          <PaintingInput
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
