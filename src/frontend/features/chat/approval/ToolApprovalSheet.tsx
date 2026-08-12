import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { parseFunctionCallToolName } from '@cherrystudio/universal/ai/tools/mcpToolName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { getBuiltInToolPresentation } from '@/frontend/components/messagePresentation/utils/builtInToolPresentation';

import type { PendingToolApproval } from '../runtime/chatRuntimeProjection';
import {
  isProviderConfigurationApproval,
  ProviderConfigApprovalSheet,
} from './ProviderConfigApprovalSheet';
import type { ToolApprovalRespondInput } from './types';

const ignoreClose = () => undefined;

type ToolApprovalSheetProps = {
  approvals: readonly PendingToolApproval[];
  isOpen: boolean;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
};

/** Shows one AI SDK tool approval at a time, regardless of the tool's source. */
export function ToolApprovalSheet({ approvals, isOpen, onRespond }: ToolApprovalSheetProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Keep the last request mounted during the sheet's close animation.
  const [lastApproval, setLastApproval] = useState<PendingToolApproval | undefined>(approvals[0]);
  if (approvals[0] && approvals[0].approvalId !== lastApproval?.approvalId) {
    setLastApproval(approvals[0]);
  }
  const approval = approvals[0] ?? lastApproval;

  if (approval && isProviderConfigurationApproval(approval)) {
    return (
      <ProviderConfigApprovalSheet
        approval={approval}
        approvalCount={approvals.length || 1}
        isOpen={isOpen}
        key={approval.approvalId}
        onRespond={onRespond}
      />
    );
  }

  const submit = async (approved: boolean) => {
    if (!approval || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onRespond({
        approvalId: approval.approvalId,
        approved,
        messageId: approval.messageId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <BottomSheet
      isCloseDisabled
      isOpen={isOpen}
      onClose={ignoreClose}
      title={t('chat.tool.approval.title')}
    >
      <View className="gap-4 px-4 pb-4">
        <View className="gap-1">
          <Text className="text-foreground-tertiary text-sm">
            {t('chat.tool.approval.description')}
          </Text>
          <Text className="font-semibold text-base text-foreground" selectable>
            {approval ? formatApprovalTitle(approval, t) : ''}
          </Text>
          {approvals.length > 1 ? (
            <Text className="text-foreground-tertiary text-xs">
              {t('chat.tool.approval.pendingCount', { count: approvals.length })}
            </Text>
          ) : null}
        </View>
        <ApprovalArgumentsPreview input={approval?.input} />
        <View className="flex-row gap-3">
          <Button
            className="flex-1"
            disabled={isSubmitting}
            onPress={() => void submit(false)}
            variant="destructive"
          >
            <Button.Label>{t('chat.tool.approval.deny')}</Button.Label>
          </Button>
          <Button
            className="flex-1"
            disabled={isSubmitting}
            onPress={() => void submit(true)}
            variant="default"
          >
            <Button.Label>{t('chat.tool.approval.allow')}</Button.Label>
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

function ApprovalArgumentsPreview({ input }: { input: unknown }) {
  const { t } = useTranslation();
  const preview = formatApprovalInput(input);

  if (!preview) {
    return null;
  }

  return (
    <View className="gap-1">
      <Text className="text-foreground-tertiary text-xs">{t('chat.tool.arguments')}</Text>
      <ScrollView
        className="max-h-48 rounded-md bg-secondary"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <Text className="p-2 font-mono text-foreground text-xs" selectable>
          {preview}
        </Text>
      </ScrollView>
    </View>
  );
}

function formatApprovalTitle(
  approval: PendingToolApproval,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const presentation = getBuiltInToolPresentation(approval.toolName);
  if (presentation || approval.toolType === 'builtin') {
    if (presentation) {
      return t(presentation.titleKey);
    }

    const words = approval.toolName.replaceAll('_', ' ');
    return words ? `${words[0].toUpperCase()}${words.slice(1)}` : approval.toolName;
  }

  const parsed = parseFunctionCallToolName(approval.toolName);
  return parsed ? `${parsed.serverPart}: ${parsed.toolPart}` : approval.toolName;
}

function formatApprovalInput(input: unknown): string {
  if (input === undefined || input === null) {
    return '';
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
