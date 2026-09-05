import { Button, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePreference } from '@/frontend/data';

import { LogoDrawAnimation } from './components/LogoDraw';

export function OnboardingScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [, setStatus] = usePreference('app.onboarding.status');
  const [isSkipping, setIsSkipping] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const isFocused = useRef(false);
  const isSaving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      return () => {
        isFocused.current = false;
      };
    }, []),
  );
  const connect = async () => {
    if (isSaving.current) return;
    isSaving.current = true;
    setIsStarting(true);
    try {
      await setStatus('pending', { optimistic: false });
      if (isFocused.current) router.push('/onboarding/provider');
    } catch {
      toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      isSaving.current = false;
      setIsStarting(false);
    }
  };

  const skip = async () => {
    if (isSaving.current) return;
    isSaving.current = true;
    setIsSkipping(true);
    try {
      await setStatus('skipped', { optimistic: false });
      if (isFocused.current) router.replace('/');
    } catch {
      toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      isSaving.current = false;
      setIsSkipping(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center gap-8 px-8 py-12">
          <LogoDrawAnimation size={104} />
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-center font-semibold text-3xl text-foreground"
            >
              {t('onboarding.welcome.title')}
            </Text>
            <Text className="text-center text-base text-muted-foreground">
              {t('onboarding.welcome.description')}
            </Text>
          </View>
        </View>
      </ScrollView>
      <View className="gap-3 px-6 pb-4">
        <Button disabled={isSkipping} loading={isStarting} onPress={connect} size="lg">
          {t('onboarding.welcome.connect')}
        </Button>
        <Button disabled={isStarting} loading={isSkipping} onPress={skip} variant="ghost">
          {t('onboarding.welcome.skip')}
        </Button>
        <Text className="text-center text-xs text-muted-foreground">
          {t('onboarding.welcome.hint')}
        </Text>
      </View>
    </View>
  );
}
