import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useBackendModule, usePreference } from '@/frontend/data';
import { MAX_VOICE_TEXT_LENGTH, type VoiceAudio } from '@/shared/contracts/voice';

import { useVoiceModel } from './useVoiceModel';
import { useVoiceRequest } from './useVoiceRequest';

export function useSpeech({ text: source, onClose }: { text: string; onClose: () => void }) {
  const voice = useBackendModule('voice');
  const model = useVoiceModel('speech');
  const request = useVoiceRequest();
  const [text, setText] = useState(source);
  const [savedVoice, saveVoice] = usePreference('feature.voice.voice_id');
  const [voiceId, setVoiceId] = useState(savedVoice);
  const [audio, setAudio] = useState<VoiceAudio | null>(null);
  const currentAudio = useRef<VoiceAudio | null>(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const textTooLong = text.length > MAX_VOICE_TEXT_LENGTH;

  const releaseCurrent = useCallback(async () => {
    const previous = currentAudio.current;
    currentAudio.current = null;
    try {
      player.pause();
      player.replace(null);
    } catch {
      // The hook may already have released the native player during unmount.
    }
    if (previous) await voice.releaseAudio(previous.id);
  }, [player, voice]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        setAudio(null);
        void releaseCurrent().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
      void releaseCurrent().catch(() => undefined);
    };
  }, [releaseCurrent]);

  function generate() {
    void request.run(
      async (signal) => {
        await releaseCurrent();
        setAudio(null);
        await Promise.all([model.save(), saveVoice(voiceId.trim())]);
        signal.throwIfAborted();
        return voice.generateSpeech({ ...model.selection, text, voice: voiceId }, { signal });
      },
      async (result, signal) => {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        signal.throwIfAborted();
        player.replace(result.uri);
        player.play();
        currentAudio.current = result;
        setAudio(result);
      },
      async (result) => {
        try {
          player.pause();
          player.replace(null);
        } catch {
          // Unmount can release the native player before this request settles.
        }
        await voice.releaseAudio(result.id);
      },
    );
  }

  function play() {
    void request.run(
      async () => {
        await player.seekTo(0);
        return currentAudio.current;
      },
      (current) => {
        if (current && currentAudio.current?.id === current.id) player.play();
      },
    );
  }

  function close() {
    request.cancel();
    void releaseCurrent().catch(() => undefined);
    onClose();
  }

  return {
    model,
    request,
    text,
    setText,
    voiceId,
    setVoiceId,
    audio,
    status,
    textTooLong,
    generate,
    play,
    stop: () => player.pause(),
    close,
  };
}
