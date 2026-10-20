import { useAlert, useToast } from '@cherrystudio/ui/components';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useFileUploadPicker } from '@/frontend/hooks/file';
import { MAX_VOICE_RECORDING_SECONDS, VoiceError } from '@/shared/contracts/voice';

import { useVoiceModel } from './useVoiceModel';
import { useVoiceRequest } from './useVoiceRequest';

type AudioInput = { uri: string; name: string };

function deleteTemporaryAudio(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // These are caller-owned cache copies; never remove the user's original selected file.
  }
}

export function useVoiceInput({
  onClose,
  onTranscribed,
}: {
  onClose: () => void;
  onTranscribed: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const permissions = useBackendModule('permissions');
  const model = useVoiceModel('transcription');
  const request = useVoiceRequest();
  const pickFile = useFileUploadPicker({ multiple: false, type: 'audio/*' });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recordingUri = useRef<string | null>(null);
  const recordingCleanup = useRef<Promise<void>>(Promise.resolve());
  const selectedInput = useRef<AudioInput | null>(null);
  const pendingInput = useRef<Promise<unknown> | null>(null);
  const alive = useRef(false);
  const [input, setInput] = useState<AudioInput | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const discardInput = useCallback(() => {
    const previous = selectedInput.current;
    selectedInput.current = null;
    if (!previous) return;
    const cleanup = () => deleteTemporaryAudio(previous.uri);
    if (pendingInput.current) void pendingInput.current.then(cleanup, cleanup);
    else cleanup();
  }, []);

  const discardRecording = useCallback(() => {
    const cleanup = recordingCleanup.current.then(async () => {
      try {
        await recorder.stop();
      } catch {
        // Preparing may have been cancelled, or the native hook may already have released it.
      }
      deleteTemporaryAudio(recordingUri.current);
      recordingUri.current = null;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    });
    recordingCleanup.current = cleanup;
    return cleanup;
  }, [recorder]);

  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      discardInput();
      setInput(null);
      setIsRecording(false);
      void discardRecording();
    });
    return () => {
      alive.current = false;
      subscription.remove();
      discardInput();
      void discardRecording();
    };
  }, [discardInput, discardRecording]);

  function selectInput(next: AudioInput) {
    discardInput();
    selectedInput.current = next;
    setInput(next);
  }

  function startRecording() {
    void request.run(
      async (signal) => {
        await recordingCleanup.current;
        signal.throwIfAborted();
        const access = await voice.requestMicrophoneAccess({ signal });
        signal.throwIfAborted();
        if (!access.granted) {
          if (access.canAskAgain)
            toast.show({ label: t('voice.permissionDenied'), variant: 'danger' });
          else
            alert.confirm({
              title: t('settings.permissions.accessRequired'),
              description: t('voice.permissionDenied'),
              confirmLabel: t('settings.permissions.openSystemSettings'),
              onConfirm: () =>
                permissions.openSystemSettings().catch(() => {
                  toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
                }),
            });
          return false;
        }
        discardInput();
        setInput(null);
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            allowsBackgroundRecording: false,
          });
          signal.throwIfAborted();
          await recorder.prepareToRecordAsync();
          recordingUri.current = recorder.uri;
          signal.throwIfAborted();
          recorder.record({ forDuration: MAX_VOICE_RECORDING_SECONDS });
          return true;
        } catch (error) {
          await discardRecording();
          throw error;
        }
      },
      (started) => {
        if (started) setIsRecording(true);
      },
      async (started) => {
        if (started) await discardRecording();
      },
    );
  }

  function stopRecording() {
    void request.run(
      async () => {
        let uri: string | null = null;
        try {
          if (recorder.isRecording) await recorder.stop();
          uri = recordingUri.current ?? recorder.uri;
          recordingUri.current = null;
          await setAudioModeAsync({ allowsRecording: false });
          if (!uri) throw new VoiceError('invalid-input', 'The recording produced no file.');
          return { uri, name: t('voice.recordedAudio') };
        } catch (error) {
          deleteTemporaryAudio(uri);
          throw error;
        } finally {
          if (alive.current) setIsRecording(false);
        }
      },
      selectInput,
      (value) => deleteTemporaryAudio(value.uri),
    );
  }

  function chooseFile() {
    void request.run(
      () => pickFile(),
      (files) => {
        if (files[0]) selectInput(files[0]);
      },
      (files) => files.forEach((file) => deleteTemporaryAudio(file.uri)),
    );
  }

  function transcribe() {
    if (!input) return;
    void request.run(
      async (signal) => {
        await model.save();
        signal.throwIfAborted();
        const operation = voice.transcribe({ ...model.selection, uri: input.uri }, { signal });
        pendingInput.current = operation;
        try {
          return await operation;
        } finally {
          if (pendingInput.current === operation) pendingInput.current = null;
        }
      },
      (text) => {
        onTranscribed(text);
        onClose();
      },
    );
  }

  function close() {
    request.cancel();
    onClose();
  }

  return {
    model,
    request,
    input,
    isRecording,
    recorderState,
    startRecording,
    stopRecording,
    chooseFile,
    transcribe,
    close,
  };
}
