import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { AssistantReadAloudInput } from '@/frontend/components/messagePresentation';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { resolveReplyReadAloudVoice } from '../utils/resolveReplyReadAloudVoice';
import {
  resolveReplyReadAloudChunkLength,
  splitReplyReadAloudText,
} from '../utils/splitReplyReadAloudText';

const logger = loggerService.withContext('ReplyReadAloud');

type ReplyReadAloudStatus = 'starting' | 'speaking';

type ReplyReadAloudSession = {
  chunkIndex: number;
  chunks: string[];
  id: number;
  language?: string;
  messageId: string;
  status: ReplyReadAloudStatus;
  voice?: string;
};

export type ReplyReadAloudErrorReason = 'speech-failed' | 'voice-unavailable';

export type UseReplyReadAloudOptions = {
  onError: (reason: ReplyReadAloudErrorReason) => void;
  topicId: string;
  visibleMessageIds: readonly string[];
};

function logSpeechError(message: string, error: unknown) {
  logger.error(message, error instanceof Error ? error : { error });
}

export function useReplyReadAloud({
  onError,
  topicId,
  visibleMessageIds,
}: UseReplyReadAloudOptions): {
  activeMessageId?: string;
  readAloud: (input: AssistantReadAloudInput) => void;
  stopReadAloud: () => void;
  stopReadAloudIfActive: (messageId: string) => Promise<void>;
} {
  const [activeMessageId, setActiveMessageId] = useState<string | undefined>(undefined);
  const activeSessionRef = useRef<ReplyReadAloudSession | undefined>(undefined);
  const intentSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  const previousTopicIdRef = useRef(topicId);
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setCurrentMessageId = useCallback((messageId?: string) => {
    if (mountedRef.current) {
      setActiveMessageId(messageId);
    }
  }, []);

  const invalidateCurrentSession = useCallback(() => {
    intentSequenceRef.current += 1;
    activeSessionRef.current = undefined;
    setCurrentMessageId(undefined);
  }, [setCurrentMessageId]);

  const stopSpeechForCleanup = useCallback((failureMessage: string) => {
    try {
      void Speech.stop().catch((error: unknown) => {
        logSpeechError(failureMessage, error);
      });
    } catch (error) {
      logSpeechError(failureMessage, error);
    }
  }, []);

  const systemCleanup = useCallback(() => {
    if (!activeSessionRef.current) {
      return;
    }

    invalidateCurrentSession();
    stopSpeechForCleanup('Failed to stop speech during system cleanup');
  }, [invalidateCurrentSession, stopSpeechForCleanup]);

  const failCurrentSession = useCallback(
    (sessionId: number, message: string, error: unknown, chunkIndex?: number) => {
      logSpeechError(message, error);
      const currentSession = activeSessionRef.current;
      if (
        currentSession?.id !== sessionId ||
        (chunkIndex !== undefined && currentSession.chunkIndex !== chunkIndex)
      ) {
        return;
      }

      invalidateCurrentSession();
      onErrorRef.current('speech-failed');
      stopSpeechForCleanup('Failed to stop speech after a read-aloud error');
    },
    [invalidateCurrentSession, stopSpeechForCleanup],
  );

  const speakChunk = useCallback(
    function speakSessionChunk(sessionId: number, chunkIndex: number) {
      const session = activeSessionRef.current;
      if (!session || session.id !== sessionId || chunkIndex >= session.chunks.length) {
        return;
      }

      session.chunkIndex = chunkIndex;
      const speechOptions: Speech.SpeechOptions = {
        onDone: () => {
          const currentSession = activeSessionRef.current;
          if (currentSession?.id !== sessionId || currentSession.chunkIndex !== chunkIndex) {
            return;
          }

          const nextChunkIndex = chunkIndex + 1;
          if (nextChunkIndex < currentSession.chunks.length) {
            speakSessionChunk(sessionId, nextChunkIndex);
            return;
          }

          invalidateCurrentSession();
        },
        onError: (error) => {
          failCurrentSession(
            sessionId,
            'Speech failed while reading a reply aloud',
            error,
            chunkIndex,
          );
        },
        onStart: () => {
          const currentSession = activeSessionRef.current;
          if (currentSession?.id !== sessionId || currentSession.chunkIndex !== chunkIndex) {
            return;
          }
          currentSession.status = 'speaking';
        },
        onStopped: () => {
          const currentSession = activeSessionRef.current;
          if (currentSession?.id !== sessionId || currentSession.chunkIndex !== chunkIndex) {
            return;
          }
          invalidateCurrentSession();
        },
      };

      if (session.voice) {
        speechOptions.voice = session.voice;
      }

      try {
        Speech.speak(session.chunks[chunkIndex], speechOptions);
      } catch (error) {
        failCurrentSession(
          sessionId,
          'Speech failed to start while reading a reply aloud',
          error,
          chunkIndex,
        );
      }
    },
    [failCurrentSession, invalidateCurrentSession],
  );

  const stopReadAloud = useCallback(() => {
    const stopIntentId = intentSequenceRef.current + 1;
    intentSequenceRef.current = stopIntentId;
    activeSessionRef.current = undefined;
    setCurrentMessageId(undefined);

    void (async () => {
      try {
        await Speech.stop();
      } catch (error) {
        logSpeechError('Failed to stop reply read-aloud', error);
        if (intentSequenceRef.current === stopIntentId) {
          onErrorRef.current('speech-failed');
        }
      }
    })();
  }, [setCurrentMessageId]);

  const readAloud = useCallback(
    (input: AssistantReadAloudInput) => {
      if (activeSessionRef.current?.messageId === input.messageId) {
        stopReadAloud();
        return;
      }

      const sessionId = intentSequenceRef.current + 1;
      intentSequenceRef.current = sessionId;
      const chunkLength = resolveReplyReadAloudChunkLength(Speech.maxSpeechInputLength);
      const session: ReplyReadAloudSession = {
        chunkIndex: 0,
        chunks: splitReplyReadAloudText(input.text, chunkLength),
        id: sessionId,
        language: input.language,
        messageId: input.messageId,
        status: 'starting',
      };
      activeSessionRef.current = session;
      setCurrentMessageId(input.messageId);

      void (async () => {
        try {
          await Speech.stop();
        } catch (error) {
          failCurrentSession(
            sessionId,
            'Failed to clear speech before reading a reply aloud',
            error,
          );
          return;
        }

        if (activeSessionRef.current?.id !== sessionId) {
          return;
        }

        if (session.language) {
          let voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;
          try {
            voices = await Speech.getAvailableVoicesAsync();
          } catch (error) {
            failCurrentSession(
              sessionId,
              'Failed to get available voices while reading a reply aloud',
              error,
            );
            return;
          }

          if (activeSessionRef.current?.id !== sessionId) {
            return;
          }

          const voice = resolveReplyReadAloudVoice(session.language, voices);
          if (!voice) {
            invalidateCurrentSession();
            onErrorRef.current('voice-unavailable');
            return;
          }
          session.voice = voice.identifier;
        }

        if (session.chunks.length === 0) {
          invalidateCurrentSession();
          return;
        }
        speakChunk(sessionId, 0);
      })();
    },
    [failCurrentSession, invalidateCurrentSession, setCurrentMessageId, speakChunk, stopReadAloud],
  );

  const stopReadAloudIfActive = useCallback(
    async (messageId: string) => {
      if (activeSessionRef.current?.messageId !== messageId) {
        return;
      }

      const stopIntentId = intentSequenceRef.current + 1;
      intentSequenceRef.current = stopIntentId;
      activeSessionRef.current = undefined;
      setCurrentMessageId(undefined);

      try {
        await Speech.stop();
      } catch (error) {
        logSpeechError('Failed to stop the active reply read-aloud', error);
        if (intentSequenceRef.current === stopIntentId) {
          onErrorRef.current('speech-failed');
        }
      }
    },
    [setCurrentMessageId],
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') {
          systemCleanup();
        }
      });

      return () => {
        subscription.remove();
        systemCleanup();
      };
    }, [systemCleanup]),
  );

  useEffect(() => {
    if (previousTopicIdRef.current !== topicId) {
      previousTopicIdRef.current = topicId;
      systemCleanup();
    }
  }, [systemCleanup, topicId]);

  useEffect(() => {
    const activeMessageId = activeSessionRef.current?.messageId;
    if (activeMessageId && !visibleMessageIds.includes(activeMessageId)) {
      systemCleanup();
    }
  }, [systemCleanup, visibleMessageIds]);

  return {
    activeMessageId,
    readAloud,
    stopReadAloud,
    stopReadAloudIfActive,
  };
}
