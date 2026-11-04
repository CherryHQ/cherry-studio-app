import { useCallback, useEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type {
  AudioTranscriptionProgress,
  AudioTranscriptionResult,
} from '@/shared/contracts/voice';
import type { LibraryFile } from '@/shared/data/types/fileLibrary';

export type AudioTranscriptionState = { file: LibraryFile } & (
  | { status: 'running'; progress?: AudioTranscriptionProgress }
  | { status: 'complete'; result: AudioTranscriptionResult }
  | { status: 'failed'; error: unknown }
);

export function useAudioTranscription() {
  const voice = useBackendModule('voice');
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<AudioTranscriptionState | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const close = useCallback(() => {
    controller.current?.abort();
    setState(null);
  }, []);
  const start = useCallback(
    (file: LibraryFile) => {
      if (controller.current) return;
      const operation = new AbortController();
      controller.current = operation;
      setState({ file, status: 'running' });
      void voice
        .transcribeAudio(
          { fileEntryId: file.entry.id, folderId: file.folderId },
          {
            signal: operation.signal,
            onProgress: (progress) => {
              if (!operation.signal.aborted) setState({ file, status: 'running', progress });
            },
          },
        )
        .then(
          (result) => {
            if (!operation.signal.aborted) setState({ file, status: 'complete', result });
          },
          (error: unknown) => {
            if (!operation.signal.aborted) setState({ file, status: 'failed', error });
          },
        )
        .finally(() => {
          if (controller.current === operation) controller.current = null;
        });
    },
    [voice],
  );
  return { state, start, close };
}
