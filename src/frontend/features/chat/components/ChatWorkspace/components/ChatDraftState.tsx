import { BackgroundPressExclusion, ContentState } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';
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

type ChatDraftStateProps = {
  assistantAvatar?: null | string;
  assistantAvatarUri?: null | string;
  assistantEmoji?: string;
  assistantName?: string;
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
  const { t } = useTranslation();
  const greeting = (
    <View className="items-center gap-6">
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

  return (
    <ChatComposerClearance
      className="flex-1 items-center justify-center px-8"
      contentBottomInset={contentBottomInset}
    >
      {modelSetup ? <LocalDraftContent {...modelSetup}>{greeting}</LocalDraftContent> : greeting}
    </ChatComposerClearance>
  );
}

function LocalDraftContent({
  children,
  modelId,
  modelType,
  returnTo,
}: ChatDraftModelSetup & { children: ReactNode }) {
  const { t } = useTranslation();
  const { allowedModelIds } = useModelChoice();
  const { getModelItem, hasLoadedCatalog, modelItems } = useModelPickerData({ modelType });
  const openProviderSetup = useOpenProviderSetup(returnTo);

  // A managed Agent takes its model choices from the organization.
  if (allowedModelIds || !hasLoadedCatalog || modelItems.length > 0 || getModelItem(modelId)) {
    return children;
  }

  const canAddProvider = capabilityPolicy('providerSettings').canEdit('providerSettings');
  return (
    <BackgroundPressExclusion>
      <ContentState.Empty
        icon={<EmptyIllustration scene="connection" />}
        primaryAction={
          canAddProvider
            ? { children: t('modelPicker.addProvider'), onPress: openProviderSetup }
            : undefined
        }
        prominence="prominent"
        title={t('modelPicker.empty')}
      />
    </BackgroundPressExclusion>
  );
}
