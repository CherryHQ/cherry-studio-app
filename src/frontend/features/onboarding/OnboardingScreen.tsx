import { Button, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatHref } from '@/frontend/appShell/navigation/chat';
import { usePreference } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';

import { LogoDrawAnimation } from './components/LogoDraw';

export function OnboardingScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [, setStatus] = usePreference('app.onboarding.status');
  const agents = useAgentsApi();
  const [pendingAction, setPendingAction] = useState<'provider' | 'desktop' | 'skip' | null>(null);
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
  const start = async (action: 'provider' | 'desktop' | 'skip') => {
    if (isSaving.current) return;
    isSaving.current = true;
    setPendingAction(action);
    try {
      let agentId: string | undefined = agents.agents[0]?.id;
      if (action === 'skip' && !agentId) {
        const result = await agents.refetch({ throwOnError: true });
        agentId = result.data?.items[0]?.id;
      }
      await setStatus(action === 'skip' ? 'skipped' : 'pending', { optimistic: false });
      if (isFocused.current) {
        if (action === 'skip') {
          router.replace(agentId ? chatHref({ agentId, kind: 'draft' }) : '/agents');
        } else
          router.push(
            action === 'desktop' ? '/onboarding/device-connections' : '/onboarding/provider',
          );
      }
    } catch {
      toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      isSaving.current = false;
      setPendingAction(null);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="onboarding-welcome"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-between gap-8 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-grow items-center justify-center gap-8 px-8 py-12">
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
        <View className="gap-3 px-6">
          <View className="gap-3">
            <Button
              disabled={pendingAction !== null}
              loading={pendingAction === 'provider'}
              onPress={() => void start('provider')}
              size="lg"
              testID="onboarding-connect"
            >
              {t('onboarding.welcome.connect')}
            </Button>
            <Button
              disabled={pendingAction !== null}
              loading={pendingAction === 'desktop'}
              onPress={() => void start('desktop')}
              size="lg"
              testID="onboarding-desktop-sync"
              variant="outline"
            >
              {t('onboarding.welcome.desktopSync')}
            </Button>
          </View>
          <View className="min-h-12 items-center justify-center">
            <Button
              disabled={pendingAction !== null}
              loading={pendingAction === 'skip'}
              onPress={() => void start('skip')}
              size="xs"
              testID="onboarding-skip"
              variant="ghost"
            >
              {t('onboarding.welcome.skip')}
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
