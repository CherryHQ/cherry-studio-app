import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import { BottomSheet, Button, ContentState, Input, useToast } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useApiClient } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

type PublishStep = 'idle' | 'creating' | 'uploading' | 'enabling' | 'done' | 'error';

type PublishSiteSheetProps = {
  html: string;
  connected: boolean;
  onClose: () => void;
};
export function PublishSiteSheet({ html, connected, onClose }: PublishSiteSheetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const api = useApiClient();
  const [repoName, setRepoName] = useState('cherry-studio-site');
  const [isPrivate, setIsPrivate] = useState(false);
  const [step, setStep] = useState<PublishStep>('idle');
  const [result, setResult] = useState<{ url: string | null; owner: string; repo: string } | null>(
    null,
  );

  const publish = async () => {
    if (step !== 'idle' && step !== 'error') return;
    setStep('creating');
    try {
      // The Data API drives pages_create_repository → pages_upload_file → pages_enable →
      // pages_status in order; each write still goes through the runtime approval policy.
      const response = await api.post('/github-pages/publish', {
        body: { repoName, html, private: isPrivate },
      });
      setResult({ url: response.url, owner: response.owner, repo: response.repo });
      setStep('done');
    } catch {
      setStep('error');
      toast.show({ label: t('publishSite.error'), variant: 'danger' });
    }
  };

  const footer =
    step === 'done' && result?.url ? (
      <View className="flex-row items-center gap-3">
        <Button
          accessibilityLabel={t('publishSite.openSite')}
          icon={<GlobeIcon />}
          onPress={() => void openExternalUrl(result.url!)}
          size="footer"
          variant="tonal"
        >
          {t('publishSite.openSite')}
        </Button>
        <View className="flex-1">
          <Button onPress={onClose} size="footer">
            {t('common.done')}
          </Button>
        </View>
      </View>
    ) : (
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Button
            disabled={!connected || step !== 'idle'}
            loading={step === 'creating' || step === 'uploading' || step === 'enabling'}
            onPress={() => void publish()}
            size="footer"
          >
            {step === 'creating'
              ? t('publishSite.createRepo')
              : step === 'uploading'
                ? t('publishSite.uploading')
                : step === 'enabling'
                  ? t('publishSite.enabling')
                  : t('publishSite.title')}
          </Button>
        </View>
      </View>
    );

  return (
    <BottomSheet footer={footer} height={step === 'done' ? 420 : 480} onClose={onClose} open>
      <View className="flex-1 gap-4 p-4">
        {!connected ? (
          <View className="gap-4">
            <Text className="text-base text-foreground">{t('publishSite.description')}</Text>
            <Button
              onPress={() => {
                onClose();
                router.push('/plugins/github/connect');
              }}
              size="footer"
              variant="tonal"
            >
              {t('publishSite.connectGithub')}
            </Button>
          </View>
        ) : step === 'done' && result ? (
          <View className="gap-3">
            <Text className="text-base font-medium text-foreground">
              {result.owner}/{result.repo}
            </Text>
            {result.url ? (
              <Pressable onPress={() => void openExternalUrl(result.url!)}>
                <Text className="text-primary underline">{result.url}</Text>
              </Pressable>
            ) : (
              <Text className="text-sm text-muted-foreground">{t('publishSite.enabling')}</Text>
            )}
          </View>
        ) : (
          <View className="gap-4">
            <Text className="text-sm text-muted-foreground">{t('publishSite.description')}</Text>
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                {t('publishSite.repoName')}
              </Text>
              <Input
                accessibilityLabel={t('publishSite.repoName')}
                autoCapitalize="none"
                onChangeText={setRepoName}
                value={repoName}
              />
              <Text className="text-xs text-muted-foreground">{t('publishSite.repoNameHint')}</Text>
            </View>
            <Pressable
              onPress={() => setIsPrivate((v) => !v)}
              className="flex-row items-center gap-2"
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded border ${
                  isPrivate ? 'border-primary bg-primary' : 'border-border'
                }`}
              >
                {isPrivate ? <Text className="text-xs text-background">✓</Text> : null}
              </View>
              <Text className="text-sm text-foreground">{t('publishSite.private')}</Text>
            </Pressable>
            {step === 'error' ? <ContentState.Error title={t('publishSite.error')} /> : null}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
