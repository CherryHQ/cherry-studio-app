import { Button, Input, Section, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { clearTranslationHandoff, getTranslationHandoff } from '@/frontend/appShell/systemEntry';
import {
  TranslationLanguagePicker,
  TranslationModelStatus,
  useTranslationAvailability,
} from '@/frontend/components/Translation';
import { useBackendModule } from '@/frontend/data';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { TranslationSession, TranslationSnapshot } from '@/shared/contracts';

const EMPTY: TranslationSnapshot = { status: 'disposed' };
const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

export function TemporaryTranslationScreen() {
  const module = useBackendModule('translation');
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ handoff?: string | string[] }>();
  const token = getSingleRouteParam(params.handoff);
  const [initial, setInitial] = useState(() => getTranslationHandoff(token));
  const [text, setText] = useState(initial?.text ?? '');
  const [language, setLanguage] = useState<string | null>(initial?.targetLanguage ?? null);
  const availability = useTranslationAvailability('app');
  const targetLanguage = language ?? availability?.targetLanguage ?? 'en-US';
  const [session, setSession] = useState<TranslationSession | null>(() =>
    initial ? module.createSession(initial) : null,
  );
  const owner = useRef<TranslationSession | null>(session);
  const sessionGeneration = useRef(0);
  const focused = useRef(false);
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? emptySubscribe,
    session?.getSnapshot ?? emptySnapshot,
  );
  const running = snapshot.status === 'running';
  const result = snapshot.status === 'succeeded' ? snapshot.result : '';

  const run = useCallback(
    (source: string, target?: string) => {
      owner.current?.dispose();
      const next = module.createSession({ text: source, targetLanguage: target });
      owner.current = next;
      setSession(next);
    },
    [module],
  );

  useEffect(() => {
    clearTranslationHandoff(token);
  }, [token]);
  useEffect(() => {
    const generation = ++sessionGeneration.current;
    void session?.run();
    return () => {
      // React's development remount retains this same owner; real replacement or unmount disposes it.
      queueMicrotask(() => {
        // Read the latest lifecycle generation, not a captured DOM ref value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (generation === sessionGeneration.current || owner.current !== session)
          session?.dispose();
      });
    };
  }, [session]);

  const clear = useCallback(() => {
    owner.current?.dispose();
    owner.current = null;
    setSession(null);
    setText('');
    setInitial(undefined);
    clearTranslationHandoff(token);
  }, [token]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        queueMicrotask(() => {
          if (!focused.current) clear();
        });
      };
    }, [clear]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clear();
    });
    return () => subscription.remove();
  }, [clear]);

  const copy = () => {
    void Clipboard.setStringAsync(result)
      .then(() => toast.show({ label: t('translation.copied'), variant: 'success' }))
      .catch(() => toast.show({ label: t('translation.copyFailed'), variant: 'danger' }));
  };

  return (
    <View className="flex-1">
      <RouteHeader title={t('translation.title')} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 px-4 py-5"
      >
        <TranslationModelStatus surface="app" />
        <Section>
          <Section.Item
            label={t('translation.modelSettings')}
            onPress={() => router.push('/settings/model')}
          />
          <TranslationLanguagePicker
            value={targetLanguage}
            onChange={(next) => {
              setLanguage(next);
              if (text.trim() && next) run(text, next);
            }}
          />
        </Section>
        <View className="gap-2">
          <Text className="text-foreground font-medium">{t('translation.original')}</Text>
          <Input
            accessibilityLabel={t('translation.original')}
            multiline
            autoCorrect={false}
            autoComplete="off"
            maxLength={16_000}
            value={text}
            placeholder={t('translation.inputPlaceholder')}
            onChangeText={(value) => {
              owner.current?.dispose();
              owner.current = null;
              setSession(null);
              setText(value);
            }}
          />
          <Text className="text-muted-foreground text-xs">
            {t('translation.inputLimit', { count: 16_000 })}
          </Text>
        </View>
        <Button loading={running} disabled={!text.trim()} onPress={() => run(text, targetLanguage)}>
          {t(
            result || snapshot.status === 'failed' ? 'translation.retry' : 'translation.translate',
          )}
        </Button>
        {running ? (
          <Button variant="secondary" onPress={() => owner.current?.cancel()}>
            {t('common.cancel')}
          </Button>
        ) : null}
        {snapshot.status === 'failed' ? (
          <Text accessibilityLiveRegion="polite" className="text-error text-sm">
            {t(`translation.error.${snapshot.error}`)}
          </Text>
        ) : null}
        {result ? (
          <View className="gap-3">
            <Text className="text-foreground font-medium">{t('translation.result')}</Text>
            <Text selectable className="text-foreground text-base">
              {result}
            </Text>
            <Button variant="secondary" onPress={copy}>
              {t('translation.copy')}
            </Button>
          </View>
        ) : null}
        <Text className="text-muted-foreground text-sm">{t('translation.privacy')}</Text>
      </ScrollView>
    </View>
  );
}
