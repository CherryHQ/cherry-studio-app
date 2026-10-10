import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import {
  Button,
  ContentState,
  OptionPickerBottomSheet,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { loggerService } from '@logger';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { chatHref } from '@/frontend/appShell/navigation/chat';
import { AgentAvatar, AvatarImagePicker } from '@/frontend/components/Avatar';
import {
  ModelPickerDrawer,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { usePreference } from '@/frontend/data/hooks';
import {
  useAgentApiById,
  useAgentMutations,
  useAgentToolBindingMutations,
  useAgentToolBindingsApi,
} from '@/frontend/hooks/agent';
import { useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { Agent, AgentMode } from '@/shared/data/types/agent';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import type { UniqueModelId } from '@/shared/data/types/model';

import { type AgentFormState, buildAgentDto, createAgentFormState } from './agentForm';
import { createAgentToolBindingDraft } from './agentToolSettings';
import { AgentCapabilitiesSection } from './components/AgentCapabilitiesSection';
import { AgentToolsSection } from './components/AgentToolsSection';
import { useAgentAutoSave } from './useAgentAutoSave';

const agentFormAvatarSize = 96;
const agentFormContentPadding = 12;
const logger = loggerService.withContext('AgentEditScreen');
const MODE_LABEL_KEYS = {
  standard: 'agent.mode.standard.label',
  minimal: 'agent.mode.minimal.label',
} as const;

export default function AgentEditScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    startChat?: string | string[];
  }>();
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
        <View className="p-4">
          <ContentState.Loading title={t('agent.form.loading')} />
        </View>
      </>
    );
  }

  if (agentId && (!agent || hasEditDataError)) {
    return (
      <>
        <RouteHeader title={t('agent.edit.title')} />
        <View className="p-4">
          <ContentState.Error
            primaryAction={{
              children: t('agent.actions.retry'),
              onPress: () => {
                void Promise.all([refetch(), refetchBindings(), refetchServers()]);
              },
            }}
            title={t('agent.form.loadFailed')}
          />
        </View>
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
      shouldStartChat={!agentId && getSingleRouteParam(params.startChat) === 'true'}
    />
  );
}

function AgentEditForm({
  agent,
  agentId,
  originalToolBindings,
  servers,
  shouldStartChat,
}: {
  agent: Agent | undefined;
  agentId?: string;
  originalToolBindings: readonly AgentToolBinding[];
  servers: readonly McpServer[];
  shouldStartChat: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const isEditing = Boolean(agentId);
  const { createAgent, deleteAgents, isCreating, isSettingAvatar, setAgentAvatar } =
    useAgentMutations();
  const { replaceAgentToolBindings } = useAgentToolBindingMutations();
  const { flush, hasFailedSave, retry, saveField, saveToolBindings } = useAgentAutoSave(agentId);
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  const openProviderSetup = useOpenProviderSetup(
    shouldStartChat ? '/agents/new?startChat=true' : undefined,
  );
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const [isToolApprovalModePickerOpen, setIsToolApprovalModePickerOpen] = useState(false);
  const [defaultModelPreference] = usePreference('agent.default_model_id');
  const [form, setForm] = useState<AgentFormState>(() => createAgentFormState(agent));
  const [toolBindings, setToolBindings] = useState<WriteAgentToolBinding[]>(() =>
    createAgentToolBindingDraft(originalToolBindings),
  );
  const [hasPickedModel, setHasPickedModel] = useState(false);
  const [seededModelId, setSeededModelId] = useState<UniqueModelId | null>(null);
  const safeAreaInsets = useSafeAreaInsets();
  const mutedForegroundColor = useThemeColor('muted-foreground');
  const selectedModel = modelPickerData.getModelItem(form.model);
  // Resolving through the picker catalog keeps a stale preference (a model the
  // user has since removed) from being seeded, which the create endpoint would
  // reject as an unregistered model.
  const defaultModelId = modelPickerData.getModelItem(defaultModelPreference)?.modelId ?? null;
  const isSaving = isCreating || isSettingAvatar;
  const isNameInvalid = isEditing && !form.name.trim();

  // New agents start on the global default model. Both the preference and the
  // model catalog load asynchronously, so keep following them until the user
  // picks a model themselves — after that a late-arriving default must not
  // overwrite the deliberate choice. Editing an existing agent never seeds:
  // its empty `model` is a real stored state, though such an agent cannot
  // start a session until a model is assigned.
  if (!isEditing && !hasPickedModel && defaultModelId !== seededModelId) {
    setSeededModelId(defaultModelId);
    setForm((current) => ({ ...current, model: defaultModelId }));
  }

  const updateForm = useCallback(
    <TKey extends keyof AgentFormState>(key: TKey, value: AgentFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
      saveField(key, value);
    },
    [saveField],
  );
  const openModelSelect = useCallback(() => {
    Keyboard.dismiss();
    setIsModelPickerOpen(true);
  }, []);
  const closeModelPicker = useCallback(() => setIsModelPickerOpen(false), []);
  const openModePicker = useCallback(() => {
    Keyboard.dismiss();
    setIsModePickerOpen(true);
  }, []);
  const closeModePicker = useCallback(() => setIsModePickerOpen(false), []);
  const handleModeSelect = useCallback(
    (mode: AgentMode) => {
      updateForm('mode', mode);
      setIsModePickerOpen(false);
    },
    [updateForm],
  );
  const handleAddProvider = useCallback(() => {
    setIsModelPickerOpen(false);
    openProviderSetup();
  }, [openProviderSetup]);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      setHasPickedModel(true);
      updateForm('model', item.modelId);
      setIsModelPickerOpen(false);
    },
    [updateForm],
  );
  const handleAvatarSelect = useCallback(
    (sourceUri: string) => updateForm('avatarUri', sourceUri),
    [updateForm],
  );
  const handleToolBindingsChange = useCallback(
    (bindings: WriteAgentToolBinding[]) => {
      setToolBindings(bindings);
      saveToolBindings(bindings);
    },
    [saveToolBindings],
  );
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
    if (isEditing) return;

    const dto = buildAgentDto(form, {
      inheritDefaultModel: !hasPickedModel,
    });

    if (!dto.ok) {
      alert.show({ title: t(dto.errorKey) });
      return;
    }

    let savedAgentId: string;

    try {
      savedAgentId = (await createAgent(dto.value)).id;
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

    // Bindings are keyed by agent id too, and fail the same non-blocking way.
    if (savedAgentId && toolBindings.length > 0) {
      try {
        await replaceAgentToolBindings(savedAgentId, toolBindings);
      } catch (error) {
        logger.error('Failed to save agent tool bindings', error as Error, {
          agentId: savedAgentId,
        });
        toast.show({ label: t('agent.toast.saveFailed'), variant: 'danger' });
      }
    }

    if (shouldStartChat) {
      router.dismissTo(chatHref({ agentId: savedAgentId, kind: 'draft' }));
    } else {
      router.back();
    }
  }, [
    agent?.avatarUri,
    alert,
    createAgent,
    form,
    hasPickedModel,
    isEditing,
    replaceAgentToolBindings,
    router,
    setAgentAvatar,
    shouldStartChat,
    t,
    toast,
    toolBindings,
  ]);
  const confirmDelete = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      alert.confirm({
        confirmLabel: t('common.delete'),
        description: t('agent.delete.message', { name: form.name.trim() || agent?.name }),
        onConfirm: () => {
          router.back();
          void deleteAgents([id]).catch(() => {
            toast.show({ label: t('agent.toast.deleteFailed'), variant: 'danger' });
          });
        },
        role: 'destructive',
        title: t('agent.delete.title'),
      });
    },
    [agent?.name, alert, deleteAgents, form.name, router, t, toast],
  );
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
      <RouteHeader rightActions={isEditing ? undefined : saveActions} title={title} />
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
        {/* The hero is the one primary object: who this Agent is. Create and edit
            share it, so a new Agent is filled in exactly where it will later be read. */}
        <View className="items-center gap-4 pb-2">
          <AvatarImagePicker
            accessibilityLabel={t('agent.form.setAvatar')}
            onBeforeOpen={Keyboard.dismiss}
            onError={reportAvatarPickError}
            onSelect={handleAvatarSelect}
            size={agentFormAvatarSize}
          >
            <View>
              <AgentAvatar
                accessibilityLabel={t('agent.form.setAvatar')}
                avatar={agent?.avatar}
                name={form.name}
                size={agentFormAvatarSize}
                uri={form.avatarUri}
              />
              <View className="absolute right-0 bottom-0 size-7 items-center justify-center rounded-full border border-border bg-card">
                <CameraIcon className="size-4 text-muted-foreground" />
              </View>
            </View>
          </AvatarImagePicker>
          <View className="items-center gap-1 self-stretch">
            {/* The underline marks the name as a field, as on a provider. */}
            <TextInput
              accessibilityLabel={t('agent.form.name')}
              autoCorrect={false}
              className={cn(
                'min-w-40 max-w-full border-b px-2 pb-1.5 text-center font-semibold text-2xl text-foreground',
                isNameInvalid ? 'border-error' : 'border-border-strong',
              )}
              cursorColor={mutedForegroundColor}
              onBlur={flush}
              onChangeText={(value) => updateForm('name', value)}
              placeholder={t('agent.form.namePlaceholder')}
              placeholderTextColor={mutedForegroundColor}
              returnKeyType="done"
              selectionColor={mutedForegroundColor}
              value={form.name}
            />
            {isNameInvalid ? (
              <Text accessibilityLiveRegion="polite" className="text-error text-sm">
                {t('agent.form.nameRequired')}
              </Text>
            ) : null}
          </View>
        </View>
        <Section title={t('agent.form.instructions')}>
          <TextInput
            accessibilityLabel={t('agent.form.instructions')}
            autoCorrect
            className="min-h-28 px-4 py-3 text-base text-foreground"
            cursorColor={mutedForegroundColor}
            multiline
            onBlur={flush}
            onChangeText={(value) => updateForm('instructions', value)}
            placeholder={t('agent.form.instructionsPlaceholder')}
            placeholderTextColor={mutedForegroundColor}
            scrollEnabled={false}
            selectionColor={mutedForegroundColor}
            textAlignVertical="top"
            value={form.instructions}
          />
        </Section>
        <View className="gap-3">
          <Section
            footer={
              form.mode === 'minimal'
                ? t('agent.mode.minimal.description')
                : t(`agent.toolApproval.mode.${form.toolApprovalMode}.description`)
            }
          >
            <Section.SelectItem
              label={t('agent.mode.title')}
              onPress={openModePicker}
              value={t(MODE_LABEL_KEYS[form.mode])}
            />
            <Section.SelectItem
              label={t('agent.form.model')}
              onPress={openModelSelect}
              value={selectedModel?.model.name ?? t('agent.model.none')}
              valueLeading={
                selectedModel ? (
                  <ModelPickerIcon
                    model={selectedModel.model}
                    provider={selectedModel.provider}
                    size={20}
                  />
                ) : undefined
              }
            />
            {form.mode === 'standard' ? (
              <Section.SelectItem
                accessibilityHint={t(
                  `agent.toolApproval.mode.${form.toolApprovalMode}.description`,
                )}
                label={t('agent.toolApproval.title')}
                onPress={openToolApprovalModePicker}
                value={t(`agent.toolApproval.mode.${form.toolApprovalMode}.label`)}
              />
            ) : null}
          </Section>
          {!modelPickerData.isLoading && modelPickerData.modelItems.length === 0 ? (
            <Button onPress={handleAddProvider} size="sm" variant="secondary">
              {t('modelPicker.addProvider')}
            </Button>
          ) : null}
        </View>
        {/* Capability groups gate which built-in tools a turn may offer; the
            approval setting above changes interaction policy only. */}
        {form.mode === 'standard' ? (
          <AgentCapabilitiesSection
            disabledCapabilities={form.disabledCapabilities}
            onChange={(next) => updateForm('disabledCapabilities', next)}
          />
        ) : null}
        {form.mode === 'standard' && (servers.length > 0 || toolBindings.length > 0) ? (
          <AgentToolsSection
            bindings={toolBindings}
            onChange={handleToolBindingsChange}
            originalBindings={originalToolBindings}
            servers={servers}
          />
        ) : null}
        {hasFailedSave ? (
          <Button onPress={retry} size="sm" variant="secondary">
            {t('agent.actions.retry')}
          </Button>
        ) : null}
        {agentId ? (
          <Section>
            <Section.Item
              destructive
              label={t('agent.actions.delete')}
              onPress={() => confirmDelete(agentId)}
              showChevron={false}
              testID="agent-delete"
            />
          </Section>
        ) : null}
      </KeyboardAwareScrollView>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          modelType={form.mode === 'minimal' ? 'text' : 'all'}
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={form.model}
          title={t('agent.form.modelSelect')}
        />
      ) : null}
      <OptionPickerBottomSheet
        onClose={closeModePicker}
        onValueChange={handleModeSelect}
        open={isModePickerOpen}
        options={[
          {
            description: t('agent.mode.standard.description'),
            label: t('agent.mode.standard.label'),
            value: 'standard',
          },
          {
            description: t('agent.mode.minimal.description'),
            label: t('agent.mode.minimal.label'),
            value: 'minimal',
          },
        ]}
        selectedValue={form.mode}
        size="compact"
        title={t('agent.mode.title')}
      />
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
    gap: 24,
    paddingHorizontal: 16,
    paddingTop: agentFormContentPadding,
  },
});
