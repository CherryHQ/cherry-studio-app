import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { BackgroundPressExclusion, Button } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { type ModelTypeFilter, useModelPickerData } from '@/frontend/components/ModelPicker';
import { useModelChoice } from '@/frontend/components/Policy';
import { capabilityPolicy } from '@/shared/data/managedPolicy';
import type { UniqueModelId } from '@/shared/data/types/model';

import { ChatComposerClearance } from './ChatComposerClearance';

export type ChatDraftModelSetup = {
  modelId: UniqueModelId | null;
  modelType: ModelTypeFilter;
  returnTo: string;
};

type ChatDraftAvatarProps = {
  assistantAvatar?: null | string;
  assistantAvatarUri?: null | string;
  assistantEmoji?: string;
  assistantName?: string;
};

type ChatDraftStateProps = ChatDraftAvatarProps & {
  contentBottomInset: number;
  modelSetup?: ChatDraftModelSetup;
};

/** Conversation state before the first message is sent. */
export function ChatDraftState({
  assistantAvatar,
  assistantAvatarUri,
  assistantEmoji,
  assistantName,
  contentBottomInset,
  modelSetup,
}: ChatDraftStateProps) {
  const avatarProps: ChatDraftAvatarProps = {
    assistantAvatar,
    assistantAvatarUri,
    assistantEmoji,
    assistantName,
  };

  return (
    <ChatComposerClearance
      className="flex-1 items-center justify-center px-6"
      contentBottomInset={contentBottomInset}
    >
      {modelSetup ? (
        <LocalDraftContent {...modelSetup} {...avatarProps} />
      ) : (
        <DraftGreeting {...avatarProps} />
      )}
    </ChatComposerClearance>
  );
}

function DraftGreeting({
  assistantAvatar,
  assistantAvatarUri,
  assistantEmoji,
  assistantName,
}: ChatDraftAvatarProps) {
  const { t } = useTranslation();

  return (
    <View className="w-full max-w-xs items-center gap-6">
      {assistantName ? (
        <AgentAvatar
          avatar={assistantAvatar}
          emoji={assistantEmoji}
          name={assistantName}
          size={48}
          uri={assistantAvatarUri}
        />
      ) : null}
      <Text className="text-center font-medium text-foreground text-xl" numberOfLines={2}>
        {t('chat.draft.greeting')}
      </Text>
    </View>
  );
}

function LocalDraftContent({
  modelId,
  modelType,
  returnTo,
  ...avatarProps
}: ChatDraftModelSetup & ChatDraftAvatarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { allowedModelIds } = useModelChoice();
  const { getModelItem, hasLoadedCatalog, modelItems } = useModelPickerData({ modelType });
  const openProviderSetup = useOpenProviderSetup(returnTo);

  // A managed Agent takes its model choices from the organization.
  const hasAvailableModel = Boolean(
    allowedModelIds || !hasLoadedCatalog || modelItems.length > 0 || getModelItem(modelId),
  );
  const canAddProvider = capabilityPolicy('providerSettings').canEdit('providerSettings');

  if (hasAvailableModel) {
    return <DraftGreeting {...avatarProps} />;
  }

  if (!canAddProvider) {
    return (
      <View className="w-full max-w-xs items-center gap-2">
        <Text className="text-center font-semibold text-foreground text-xl" numberOfLines={2}>
          {t('chat.draft.noAvailableModel')}
        </Text>
      </View>
    );
  }

  return (
    <View className="w-full max-w-xs items-center gap-5">
      <Text className="text-center font-semibold text-foreground text-xl" numberOfLines={2}>
        {t('chat.draft.noProviderTitle')}
      </Text>
      <BackgroundPressExclusion>
        <View className="flex-row flex-wrap items-center justify-center gap-2.5">
          <Button
            haptic="light"
            icon={<PlusIcon />}
            onPress={openProviderSetup}
            shape="pill"
            size="sm"
            testID="chat-draft-add-provider"
            variant="tonal"
          >
            {t('modelPicker.addProvider')}
          </Button>
          <Button
            haptic="light"
            icon={<MonitorIcon />}
            onPress={() =>
              router.push({
                pathname: '/settings/provider/desktop-sync',
                params: { returnTo },
              })
            }
            shape="pill"
            size="sm"
            testID="chat-draft-desktop-sync"
            variant="tonal"
          >
            {t('settings.provider.desktopSync.title')}
          </Button>
        </View>
      </BackgroundPressExclusion>
    </View>
  );
}
