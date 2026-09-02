import {
  ContentState,
  Input,
  OptionPickerBottomSheet,
  SelectField,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentAvatar, AvatarPickerField } from '@/frontend/components/avatar';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/modelPicker';
import { usePreference } from '@/frontend/data/hooks';
import {
  useAgentApiById,
  useAgentMutations,
  useAgentToolBindingMutations,
  useAgentToolBindingsApi,
} from '@/frontend/hooks/agent';
import { useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { Agent } from '@/shared/data/types/agent';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import type { UniqueModelId } from '@/shared/data/types/model';

import { AgentCapabilitiesSection } from './AgentCapabilitiesSection';
import { type AgentFormState, buildAgentDto, createAgentFormState } from './agentForm';
import { createAgentToolBindingDraft } from './agentToolSettings';
import { AgentToolsSection } from './AgentToolsSection';

const agentFormAvatarSize = 104;
const agentFormContentPadding = 20;
const logger = loggerService.withContext('AgentEditScreen');

export default function AgentEditScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ agentId?: string | string[] }>();
  const agentId = getSingleRouteParam(params.agentId);
  const { agent, isLoading, refetch } = useAgentApiById(agentId);
  const {
    bindings,
    error: bindingsError,
    isLoading: areBindingsLoading,
    refetch: refetchBindings,
  } = useAgentToolBindingsApi(agentId);
  const {
    error: serversError,
    isLoading: areServersLoading,
    refetch: refetchServers,
    servers,
  } = useMcpServersApi();
  const isLoadingEditData =
    Boolean(agentId) && (isLoading || areBindingsLoading || areServersLoading);
  const hasEditDataError = Boolean(agentId) && (bindingsError || serversError);

  // The form seeds its fields from the record when it mounts, so it must not mount
  // before the record is there — an empty form that reseeds a commit later would throw
  // away whatever the user had already typed into it.
  if (isLoadingEditData) {
    return (
      <>
        <RouteHeader title={t('agent.edit.title')} />
        <ContentState.Loading className="p-4" title={t('agent.form.loading')} />
      </>
    );
  }

  if (agentId && (!agent || hasEditDataError)) {
    return (
      <>
        <RouteHeader title={t('agent.edit.title')} />
        <ContentState.Error
          className="p-4"
          primaryAction={{
            children: t('agent.actions.retry'),
            onPress: () => {
              void Promise.all([refetch(), refetchBindings(), refetchServers()]);
            },
          }}
          title={t('agent.form.loadFailed')}
        />
      </>
    );
  }

  return (
    <AgentEditForm
      key={agentId ?? 'new'}
      agent={agent}
      agentId={agentId}
      originalToolBindings={bindings}
      servers={servers}
    />
  );
}

function AgentEditForm({
  agent,
  agentId,
  originalToolBindings,
  servers,
}: {
  agent: Agent | undefined;
  agentId?: string;
  originalToolBindings: readonly AgentToolBinding[];
  servers: readonly McpServer[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const isEditing = Boolean(agentId);
  const { createAgent, isCreating, isSettingAvatar, isUpdating, setAgentAvatar, updateAgent } =
    useAgentMutations();
  const { isReplacing, replaceAgentToolBindings } = useAgentToolBindingMutations();
  const modelPickerData = useModelPickerData({ modelType: 'text' });
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isToolApprovalModePickerOpen, setIsToolApprovalModePickerOpen] = useState(false);
  const [defaultModelPreference] = usePreference('agent.default_model_id');
  const [form, setForm] = useState<AgentFormState>(() => createAgentFormState(agent));
  const [toolBindings, setToolBindings] = useState<WriteAgentToolBinding[]>(() =>
    createAgentToolBindingDraft(originalToolBindings),
  );
  const [hasPickedModel, setHasPickedModel] = useState(false);
  const [seededModelId, setSeededModelId] = useState<UniqueModelId | null>(null);
  const safeAreaInsets = useSafeAreaInsets();
  const selectedModel = modelPickerData.getModelItem(form.modelId);
  // Resolving through the picker catalog keeps a stale preference (a model the
  // user has since removed) from being seeded, which the create endpoint would
  // reject as an unregistered model.
  const defaultModelId = modelPickerData.getModelItem(defaultModelPreference)?.modelId ?? null;
  const isSaving = isCreating || isReplacing || isSettingAvatar || isUpdating;

  // New agents start on the global default model. Both the preference and the
  // model catalog load asynchronously, so keep following them until the user
  // picks a model themselves — after that a late-arriving default must not
  // overwrite the deliberate choice. Editing an existing agent never seeds:
  // its empty `modelId` is a real stored state, though such an agent cannot
  // start a session until a model is assigned.
  if (!isEditing && !hasPickedModel && defaultModelId !== seededModelId) {
    setSeededModelId(defaultModelId);
    setForm((current) => ({ ...current, modelId: defaultModelId }));
  }

  const updateForm = useCallback(
    <TKey extends keyof AgentFormState>(key: TKey, value: AgentFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );
  const openModelSelect = useCallback(() => {
    Keyboard.dismiss();
    setIsModelPickerOpen(true);
  }, []);
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setHasPickedModel(true);
    setForm((current) => ({ ...current, modelId: item.modelId }));
    setIsModelPickerOpen(false);
  }, []);
  // Draft only. The file write needs an agent row to point at, which on create
  // does not exist until Save returns an id.
  const handleAvatarSelect = useCallback((sourceUri: string) => {
    setForm((current) => ({ ...current, avatarUri: sourceUri }));
  }, []);
  const openToolApprovalModePicker = useCallback(() => {
    Keyboard.dismiss();
    setIsToolApprovalModePickerOpen(true);
  }, []);
  const closeToolApprovalModePicker = useCallback(() => setIsToolApprovalModePickerOpen(false), []);
  const handleToolApprovalModeSelect = useCallback(
    (mode: AgentFormState['toolApprovalMode']) => {
      if (mode === form.toolApprovalMode) {
        return;
      }

      if (mode === 'auto') {
        alert.confirm({
          confirmLabel: t('agent.toolApproval.autoConfirmLabel'),
          description: t('agent.toolApproval.autoConfirmDescription'),
          onConfirm: () => updateForm('toolApprovalMode', 'auto'),
          title: t('agent.toolApproval.autoConfirmTitle'),
        });
        return;
      }

      updateForm('toolApprovalMode', mode);
    },
    [alert, form.toolApprovalMode, t, updateForm],
  );
  const reportAvatarPickError = useCallback(
    (error: unknown) => {
      logger.error('Failed to pick an agent avatar', error as Error);
      toast.show({ label: t('agent.toast.avatarSaveFailed'), variant: 'danger' });
    },
    [t, toast],
  );
  const handleSave = useCallback(async () => {
    const dto = buildAgentDto(form, {
      inheritDefaultModel: !agentId && !hasPickedModel,
    });

    if (!dto.ok) {
      alert.show({ title: t(dto.errorKey) });
      return;
    }

    let savedAgentId = agentId;

    try {
      if (agentId) {
        await updateAgent(agentId, dto.value);
        await replaceAgentToolBindings(agentId, toolBindings);
      } else {
        savedAgentId = (await createAgent(dto.value)).id;
      }
    } catch {
      toast.show({ label: t('agent.toast.saveFailed'), variant: 'danger' });
      return;
    }

    // The avatar is a managed file keyed by agent id, so it can only be written
    // once the record exists — and only when the draft moved off its seed.
    // A failure here is reported but does not keep the form open: the agent is
    // already saved, and a second Save from a create form would create a second
    // agent.
    if (savedAgentId && form.avatarUri && form.avatarUri !== (agent?.avatarUri ?? null)) {
      try {
        await setAgentAvatar(savedAgentId, form.avatarUri);
      } catch (error) {
        logger.error('Failed to save agent avatar', error as Error, { agentId: savedAgentId });
        toast.show({ label: t('agent.toast.avatarSaveFailed'), variant: 'danger' });
      }
    }

    router.back();
  }, [
    agent?.avatarUri,
    agentId,
    alert,
    createAgent,
    form,
    hasPickedModel,
    replaceAgentToolBindings,
    router,
    setAgentAvatar,
    t,
    toast,
    toolBindings,
    updateAgent,
  ]);
  // The header is opaque here, so the only inset left to clear is the home
  // indicator — and that one is owned rather than left to
  // `contentInsetAdjustmentBehavior`, because presenting the image picker's
  // full-screen modal wipes whatever the scroll view adjusted for itself.
  const scrollContentStyle = useMemo(
    () => [
      styles.scrollContent,
      { paddingBottom: agentFormContentPadding + safeAreaInsets.bottom },
    ],
    [safeAreaInsets.bottom],
  );
  const title = isEditing ? t('agent.edit.title') : t('agent.create.title');
  const saveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: isSaving,
        key: 'save',
        label: isSaving ? t('agent.form.saving') : t('common.save'),
        onPress: () => {
          void handleSave();
        },
        type: 'label',
      },
    ],
    [handleSave, isSaving, t],
  );

  return (
    <>
      <RouteHeader rightActions={saveActions} title={title} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={scrollContentStyle}
        contentInsetAdjustmentBehavior="never"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <AvatarPickerField
          caption={t('agent.form.setAvatar')}
          onBeforeOpen={Keyboard.dismiss}
          onError={reportAvatarPickError}
          onSelect={handleAvatarSelect}
        >
          <AgentAvatar
            accessibilityLabel={t('agent.form.setAvatar')}
            name={form.name}
            size={agentFormAvatarSize}
            uri={form.avatarUri}
          />
        </AvatarPickerField>
        {/* No card and no rows: each field stands on its own, so the only chrome
            is the one the `Input` already draws. The model row borrows that same
            outline so the three read as one set. */}
        <View className="gap-3">
          <Input
            accessibilityLabel={t('agent.form.name')}
            autoCorrect={false}
            onChangeText={(value) => updateForm('name', value)}
            placeholder={t('agent.form.namePlaceholder')}
            returnKeyType="next"
            value={form.name}
          />
          <Input
            accessibilityLabel={t('agent.form.instructions')}
            autoCorrect
            multiline
            onChangeText={(value) => updateForm('instructions', value)}
            placeholder={t('agent.form.instructionsPlaceholder')}
            value={form.instructions}
          />
          <SelectField accessibilityLabel={t('agent.form.modelSelect')} onPress={openModelSelect}>
            <SelectField.Label>{t('agent.form.modelSelect')}</SelectField.Label>
            <SelectField.Value>
              {selectedModel ? (
                <ModelPickerIcon
                  model={selectedModel.model}
                  provider={selectedModel.provider}
                  providerIconSize={18}
                  size={20}
                />
              ) : null}
              <SelectField.ValueText>
                {selectedModel?.model.name ?? t('agent.model.none')}
              </SelectField.ValueText>
            </SelectField.Value>
          </SelectField>
          <View className="gap-1">
            <SelectField
              accessibilityHint={t(`agent.toolApproval.mode.${form.toolApprovalMode}.description`)}
              accessibilityLabel={t('agent.toolApproval.title')}
              onPress={openToolApprovalModePicker}
            >
              <SelectField.Label>{t('agent.toolApproval.title')}</SelectField.Label>
              <SelectField.Value>
                <SelectField.ValueText>
                  {t(`agent.toolApproval.mode.${form.toolApprovalMode}.label`)}
                </SelectField.ValueText>
              </SelectField.Value>
            </SelectField>
            <Text className="px-1 text-muted-foreground text-sm" selectable>
              {t(`agent.toolApproval.mode.${form.toolApprovalMode}.description`)}
            </Text>
          </View>
        </View>
        {/* Capability groups gate which built-in tools a turn may offer; the
            approval setting above changes interaction policy only. */}
        <AgentCapabilitiesSection
          disabledCapabilities={form.disabledCapabilities}
          onChange={(next) => updateForm('disabledCapabilities', next)}
        />
        {isEditing && (servers.length > 0 || toolBindings.length > 0) ? (
          <AgentToolsSection
            bindings={toolBindings}
            onChange={setToolBindings}
            originalBindings={originalToolBindings}
            servers={servers}
          />
        ) : null}
      </KeyboardAwareScrollView>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={form.modelId}
          title={t('agent.form.modelSelect')}
        />
      ) : null}
      <OptionPickerBottomSheet
        helperText={t('agent.toolApproval.footer')}
        onClose={closeToolApprovalModePicker}
        onValueChange={handleToolApprovalModeSelect}
        open={isToolApprovalModePickerOpen}
        options={[
          {
            description: t('agent.toolApproval.mode.default.description'),
            label: t('agent.toolApproval.mode.default.label'),
            value: 'default',
          },
          {
            description: t('agent.toolApproval.mode.auto.description'),
            label: t('agent.toolApproval.mode.auto.label'),
            value: 'auto',
          },
        ]}
        selectedValue={form.toolApprovalMode}
        size="compact"
        title={t('agent.toolApproval.title')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 32,
    paddingHorizontal: 16,
    paddingTop: agentFormContentPadding,
  },
});
