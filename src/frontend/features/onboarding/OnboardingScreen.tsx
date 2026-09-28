import { Button, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatHref } from '@/frontend/appShell/navigation/chat';
import { usePreference } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';

import { LOGO_ASPECT_RATIO, LogoDrawAnimation } from './components/LogoDraw';
import { useWelcomeIntro, WELCOME_LOGO_INTRO_SCALE } from './hooks/useWelcomeIntro';

const LOGO_SIZE = 104;
const LOGO_INTRO_SIZE = LOGO_SIZE * WELCOME_LOGO_INTRO_SCALE;
const logoFrameStyle = { height: LOGO_SIZE, width: LOGO_SIZE * LOGO_ASPECT_RATIO };
// The logo renders at its intro size and scales down to rest, so the enlarged draw stays sharp.
const logoCanvasStyle = {
  left: ((LOGO_SIZE - LOGO_INTRO_SIZE) * LOGO_ASPECT_RATIO) / 2,
  position: 'absolute',
  top: (LOGO_SIZE - LOGO_INTRO_SIZE) / 2,
} as const;

export function OnboardingScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [, setStatus] = usePreference('app.onboarding.status');
  const agents = useAgentsApi();
  const {
    rootRef,
    logoFrameRef,
    logoRef,
    measureLogoFrame,
    playing,
    skippable,
    skip,
    logoStyle,
    headingStyle,
    descriptionStyle,
    actionsStyle,
    secondaryActionStyle,
  } = useWelcomeIntro();
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
      ref={rootRef}
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="onboarding-welcome"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-between gap-8 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-grow items-center justify-center gap-8 px-8 py-12">
          <View ref={logoFrameRef} style={logoFrameStyle} onLayout={measureLogoFrame}>
            <Animated.View style={[logoCanvasStyle, logoStyle]}>
              <LogoDrawAnimation ref={logoRef} autoPlay={playing} size={LOGO_INTRO_SIZE} />
            </Animated.View>
          </View>
          <View className="items-center gap-3">
            <Animated.View style={headingStyle}>
              <Text
                accessibilityRole="header"
                className="text-center font-semibold text-3xl text-foreground"
              >
                {t('onboarding.welcome.title')}
              </Text>
            </Animated.View>
            <Animated.View style={descriptionStyle}>
              <Text className="text-center text-base text-muted-foreground">
                {t('onboarding.welcome.description')}
              </Text>
            </Animated.View>
          </View>
        </View>
        <View className="gap-3 px-6">
          <Animated.View className="gap-3" style={actionsStyle}>
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
          </Animated.View>
          <Animated.View
            className="min-h-12 items-center justify-center"
            style={secondaryActionStyle}
          >
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
          </Animated.View>
        </View>
      </ScrollView>
      {skippable ? (
        <Pressable
          accessible={false}
          className="absolute inset-0"
          importantForAccessibility="no"
          onPress={skip}
          testID="onboarding-intro-skip"
        />
      ) : null}
    </View>
  );
}
