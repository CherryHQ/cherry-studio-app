import { BottomSheet, Button, Surface } from '@cherrystudio/ui/components';
import type { BottomSheetCloseReason } from '@cherrystudio/ui/components';
import {
  CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
  CREATE_CUSTOM_PROVIDER_TOOL_NAME,
  type ProviderConfigurationManualModel,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolveClassNames } from 'uniwind';

import { useBackendModule } from '@/frontend/data';
import {
  findInvalidCustomProviderEndpointUrl,
  getProviderPrimaryBaseUrl,
  isCustomProviderFormComplete,
} from '@/frontend/features/settings/providerConfiguration';
import type { ProviderSetupMatchedProvider, ProviderSetupPreview } from '@/shared/contracts';

import type { PendingToolApproval } from '../runtime/chatRuntimeProjection';
import {
  ProviderConfigConfigurationPage,
  ProviderConfigModelsPage,
} from './ProviderConfigApprovalPages';
import {
  canContinueProviderConfig,
  createProviderConfigDraft,
  customFormValueFromInput,
  dedupeManualModels,
  type ProviderConfigDraft,
  type ProviderConfigSetupStep,
  providerConfigSetupSteps,
  withManualModels,
  withModelPullEnabled,
  withModelSelections,
} from './providerConfigDraft';
import type { ToolApprovalRespondInput } from './types';

const userCancelledReason = 'Provider configuration was cancelled by the user.';
const ACTION_HEIGHT = 40;
const PROGRESS_HEIGHT = 32;

function ProviderConfigProgress({ current, total }: { current: number; total: number }) {
  return (
    <Surface
      className="bg-secondary"
      cornerRadius={PROGRESS_HEIGHT / 2}
      style={styles.progressSurface}
      testID="provider-config-progress"
    >
      <Text
        className="text-foreground text-sm"
        style={styles.progressText}
        testID="provider-config-progress-label"
      >
        {current}/{total}
      </Text>
    </Surface>
  );
}

function ProviderConfigActionButton({
  disabled,
  label,
  loading = false,
  onPress,
  tone,
}: {
  disabled: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone: 'primary' | 'secondary';
}) {
  const surfaceClassName = tone === 'primary' ? 'bg-foreground' : 'border border-border bg-field';
  const surfaceFill = useResolveClassNames(surfaceClassName);
  const tintColor =
    typeof surfaceFill.backgroundColor === 'string' ? surfaceFill.backgroundColor : undefined;

  return (
    <Surface
      className={surfaceClassName}
      cornerRadius={ACTION_HEIGHT / 2}
      interactive={!disabled && !loading}
      style={styles.actionSurface}
      testID={`provider-config-action-${tone}`}
      tintColor={tintColor}
    >
      <Button
        className="h-full w-full rounded-full bg-transparent p-2 shadow-none"
        disabled={disabled}
        loading={loading}
        onPress={onPress}
        variant={tone === 'primary' ? 'default' : 'ghost'}
      >
        {label}
      </Button>
    </Surface>
  );
}

export function isProviderConfigurationApproval(approval: PendingToolApproval | undefined) {
  return (
    approval?.toolName === CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME ||
    approval?.toolName === CREATE_CUSTOM_PROVIDER_TOOL_NAME
  );
}

export function ProviderConfigApprovalSheet({
  approval,
  approvalCount,
  isOpen,
  onRespond,
}: {
  approval: PendingToolApproval;
  approvalCount: number;
  isOpen: boolean;
  onRespond: (input: ToolApprovalRespondInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const providerSetup = useBackendModule('providerSetup');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [draft, setDraft] = useState<ProviderConfigDraft | null>(() =>
    createProviderConfigDraft(approval),
  );
  const [step, setStep] = useState<ProviderConfigSetupStep>(() =>
    draft?.input.intent === 'models' ? 'models' : 'configuration',
  );
  const [builtinSnapshot, setBuiltinSnapshot] = useState<ProviderSetupMatchedProvider | null>(null);
  const [preview, setPreview] = useState<ProviderSetupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<ReadonlySet<UniqueModelId>>(new Set());
  const [removedModelIds, setRemovedModelIds] = useState<ReadonlySet<UniqueModelId>>(new Set());
  const previewAbortControllerRef = useRef<AbortController | null>(null);
  const previewRunIdRef = useRef(0);
  const stepIndex = Math.max(0, providerConfigSetupSteps.indexOf(step));
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const sheetHeight = Math.max(360, Math.min(760, availableHeight * 0.94));
  const builtinProviderQuery = draft?.kind === 'builtin' ? draft.input.provider : null;

  const abortPreview = useCallback(() => {
    previewRunIdRef.current += 1;
    previewAbortControllerRef.current?.abort();
    previewAbortControllerRef.current = null;
  }, []);

  const loadPreview = useCallback(
    async (nextDraft: ProviderConfigDraft, moveToModels = true) => {
      previewAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      const runId = previewRunIdRef.current + 1;
      previewAbortControllerRef.current = abortController;
      previewRunIdRef.current = runId;
      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        const result =
          nextDraft.kind === 'builtin'
            ? await providerSetup.previewBuiltin(nextDraft.input, abortController.signal)
            : await providerSetup.previewCustom(nextDraft.input, abortController.signal);
        if (abortController.signal.aborted || previewRunIdRef.current !== runId) return;

        setPreview(result);
        if (nextDraft.kind === 'builtin') {
          setBuiltinSnapshot(result);
          setDraft((current) =>
            current?.kind === 'builtin'
              ? { ...current, input: { ...current.input, provider: result.provider.id } }
              : current,
          );
        }
        setSelectedModelIds(new Set(result.defaultSelectedModelIds));
        setRemovedModelIds(new Set());
        if (moveToModels) setStep('models');
      } catch (error) {
        if (abortController.signal.aborted || previewRunIdRef.current !== runId) return;
        setPreviewError(error instanceof Error ? error.message : String(error));
        setStep((current) => (current === 'models' ? 'configuration' : current));
      } finally {
        if (previewRunIdRef.current === runId) {
          previewAbortControllerRef.current = null;
          setIsPreviewLoading(false);
        }
      }
    },
    [providerSetup],
  );

  useEffect(() => {
    return abortPreview;
  }, [abortPreview]);

  useEffect(() => {
    if (
      !isOpen ||
      !draft ||
      draft.input.intent !== 'models' ||
      preview ||
      isPreviewLoading ||
      previewError
    ) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return loadPreview(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [draft, isOpen, isPreviewLoading, loadPreview, preview, previewError]);

  useEffect(() => {
    if (!isOpen || builtinProviderQuery === null || builtinSnapshot) return;
    let cancelled = false;
    void providerSetup
      .resolveBuiltin(builtinProviderQuery)
      .then((result) => {
        if (cancelled) return;
        if (result.status !== 'matched') {
          setPreviewError(result.message);
          return;
        }

        setBuiltinSnapshot(result);
        setDraft((current) => {
          if (current?.kind !== 'builtin') return current;
          const input = { ...current.input, provider: result.provider.id };
          if (!result.canEditEndpoint && current.input.baseUrl) {
            return { ...current, input: { ...input, baseUrl: '' } };
          }
          if (!current.input.baseUrl && result.canEditEndpoint) {
            const baseUrl = getProviderPrimaryBaseUrl(result.provider);
            if (baseUrl) return { ...current, input: { ...input, baseUrl } };
          }
          return { ...current, input };
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [builtinProviderQuery, builtinSnapshot, isOpen, providerSetup]);

  const deny = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onRespond({
        approvalId: approval.approvalId,
        approved: false,
        messageId: approval.messageId,
        reason: userCancelledReason,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [approval.approvalId, approval.messageId, isSubmitting, onRespond]);

  const handleClose = useCallback(
    (reason: BottomSheetCloseReason) => {
      abortPreview();
      setIsPreviewLoading(false);
      if (reason !== 'controlled') void deny();
    },
    [abortPreview, deny],
  );

  const approve = useCallback(
    async (approvedDraft: ProviderConfigDraft) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        await onRespond({
          approvalId: approval.approvalId,
          approved: true,
          messageId: approval.messageId,
          updatedInput: { ...approvedDraft.input },
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [approval.approvalId, approval.messageId, isSubmitting, onRespond],
  );

  const goBack = useCallback(() => {
    abortPreview();
    setIsPreviewLoading(false);
    if (step === 'models') setStep('configuration');
  }, [abortPreview, step]);

  const goForward = useCallback(() => {
    if (!draft) return;
    if (step === 'configuration') {
      if (draft.kind === 'custom') {
        const formValue = customFormValueFromInput(draft.input);
        if (
          !isCustomProviderFormComplete(formValue) ||
          findInvalidCustomProviderEndpointUrl(formValue.endpointUrls)
        ) {
          setPreviewError(t('settings.provider.apiService.invalidBaseUrlMessage'));
          return;
        }
      }
      void loadPreview(draft);
      return;
    }
    if (step === 'models') {
      void approve(
        withModelSelections(
          draft,
          selectedModelIds,
          removedModelIds,
          preview?.catalogSource === 'skipped',
        ),
      );
    }
  }, [
    approve,
    draft,
    loadPreview,
    preview?.catalogSource,
    removedModelIds,
    selectedModelIds,
    step,
    t,
  ]);

  const retryPreview = useCallback(() => {
    if (!draft) return;
    const nextDraft = withModelPullEnabled(draft);
    setDraft(nextDraft);
    void loadPreview(nextDraft);
  }, [draft, loadPreview]);

  const addManualModels = useCallback(
    (models: ProviderConfigurationManualModel[]) => {
      setDraft((current) =>
        current
          ? withManualModels(
              current,
              dedupeManualModels([...current.input.manualModels, ...models]),
            )
          : current,
      );
      if (preview) {
        const manualModelIds = new Set(models.map((model) => model.modelId.trim()));
        const catalogIds = new Set(
          preview.models.added
            .filter((model) => manualModelIds.has(model.modelId))
            .map((model) => model.id),
        );
        setSelectedModelIds(
          (current) => new Set([...current].filter((modelId) => !catalogIds.has(modelId))),
        );
      }
    },
    [preview],
  );

  const removeManualModel = useCallback((modelId: string) => {
    setDraft((current) =>
      current
        ? withManualModels(
            current,
            current.input.manualModels.filter((model) => model.modelId !== modelId),
          )
        : current,
    );
  }, []);

  const title = t(`chat.providerConfig.step.${step}`);
  const actionLabel =
    step === 'models' ? t('chat.providerConfig.confirm') : t('chat.providerConfig.next');

  if (!draft) {
    return (
      <BottomSheet
        height={sheetHeight}
        isOpen={isOpen}
        onClose={handleClose}
        title={t('chat.providerConfig.title')}
      >
        <View className="flex-1 justify-between gap-4 px-4 pb-4">
          <Text className="text-destructive text-sm" selectable>
            {t('chat.providerConfig.invalidInput')}
          </Text>
          <Button loading={isSubmitting} onPress={() => void deny()} variant="destructive">
            {t('common.cancel')}
          </Button>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      closeAccessibilityLabel={t('common.cancel')}
      headerRight={
        <ProviderConfigProgress current={stepIndex + 1} total={providerConfigSetupSteps.length} />
      }
      height={sheetHeight}
      isCloseDisabled={isSubmitting}
      isOpen={isOpen}
      onClose={handleClose}
      testID="provider-config-approval"
      title={title}
    >
      <View className="relative min-h-0 flex-1">
        <BottomSheet.PageTransition depth={stepIndex} pageKey={step} testID="provider-config-page">
          {step === 'configuration' ? (
            <ProviderConfigConfigurationPage
              draft={draft}
              error={previewError}
              isDisabled={isPreviewLoading || isSubmitting}
              providerSnapshot={preview ?? builtinSnapshot}
              onChange={setDraft}
            />
          ) : (
            <ProviderConfigModelsPage
              draft={draft}
              isDisabled={isPreviewLoading || isSubmitting}
              preview={preview}
              removedModelIds={removedModelIds}
              selectedModelIds={selectedModelIds}
              onAddManualModels={addManualModels}
              onRemoveManualModel={removeManualModel}
              onRemovedModelIdsChange={setRemovedModelIds}
              onRetry={retryPreview}
              onSelectedModelIdsChange={setSelectedModelIds}
            />
          )}
        </BottomSheet.PageTransition>
        <View
          className="absolute inset-x-4 bottom-3 z-10 items-center gap-2 py-7"
          testID="provider-config-floating-action"
        >
          {approvalCount > 1 ? (
            <Text className="text-foreground-tertiary text-xs">
              {t('chat.tool.approval.pendingCount', { count: approvalCount })}
            </Text>
          ) : null}
          <View className="w-full flex-row gap-3" testID="provider-config-actions">
            {step === 'models' ? (
              <ProviderConfigActionButton
                disabled={isSubmitting}
                label={t('chat.providerConfig.previous')}
                onPress={goBack}
                tone="secondary"
              />
            ) : null}
            <ProviderConfigActionButton
              disabled={!canContinueProviderConfig(step, draft, preview)}
              label={actionLabel}
              loading={isPreviewLoading || isSubmitting}
              onPress={goForward}
              tone="primary"
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actionSurface: {
    flex: 1,
    height: ACTION_HEIGHT,
  },
  progressSurface: {
    alignItems: 'center',
    height: PROGRESS_HEIGHT,
    justifyContent: 'center',
    width: 40,
  },
  progressText: {
    fontVariant: ['tabular-nums'],
  },
});
