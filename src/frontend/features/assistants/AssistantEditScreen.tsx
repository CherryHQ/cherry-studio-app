import { ChevronDownIcon, ChevronRightIcon } from '@cherrystudio/app-icons';
import { Description, Input, Label, Switch, TextField } from '@cherrystudio/ui/components';
import type { CreateAssistantDto } from '@cherrystudio/universal/data/api/schemas/assistants';
import {
  type Assistant,
  type AssistantSettings,
  DEFAULT_ASSISTANT_SETTINGS,
  type McpMode,
} from '@cherrystudio/universal/data/types/assistant';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useAlert } from '@/frontend/components/AlertProvider';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useModelPickerData } from '@/frontend/components/modelPicker';
import { SingleSelectionSheet } from '@/frontend/components/selectionSheet';
import { usePreference } from '@/frontend/data/hooks';
import { useAssistantApiById, useAssistantMutations } from '@/frontend/hooks/chat';
import { useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import { keyboardBottomOffset } from '@/frontend/utils/constants';

import { EmojiPickerBottomSheet } from './components/EmojiPickerBottomSheet';

type AssistantFormState = {
  customParametersJson: string;
  description: string;
  emoji: string;
  enableMaxTokens: boolean;
  enableMaxToolCalls: boolean;
  enableTemperature: boolean;
  enableTopP: boolean;
  enableWebSearch: boolean;
  maxTokens: string;
  maxToolCalls: string;
  mcpMode: McpMode;
  mcpServerIds: string[];
  modelId: UniqueModelId | null;
  name: string;
  prompt: string;
  reasoningEffort: ReasoningEffortOption;
  streamOutput: boolean;
  temperature: string;
  topP: string;
};

const defaultEmoji = '🌟';

export default function AssistantEditScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    assistantId?: string | string[];
    modelId?: string | string[];
  }>();
  const assistantId = getSingleParamValue(params.assistantId);
  // Set by the model picker screen on its way out — see `AssistantModelSelectScreen`.
  const pickedModelId = getSingleParamValue(params.modelId);
  const { assistant, isLoading } = useAssistantApiById(assistantId);

  // The form seeds its fields from the record when it mounts, so it must not mount
  // before the record is there — an empty form that reseeds a commit later would throw
  // away whatever the user had already typed into it.
  if (assistantId && isLoading) {
    return (
      <>
        <BackHeader title={t('assistant.edit.title')} />
        <View className="p-4">
          <Text className="text-center text-foreground text-sm">{t('assistant.form.loading')}</Text>
        </View>
      </>
    );
  }

  return (
    <AssistantEditForm
      assistant={assistant}
      assistantId={assistantId}
      pickedModelId={pickedModelId}
    />
  );
}

function AssistantEditForm({
  assistant,
  assistantId,
  pickedModelId,
}: {
  assistant: Assistant | undefined;
  assistantId: string | undefined;
  pickedModelId: string | undefined;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const isEditing = Boolean(assistantId);
  const { createAssistant, isCreating, isUpdating, updateAssistant } = useAssistantMutations();
  const modelPickerData = useModelPickerData();
  const { servers: mcpServers } = useMcpServersApi();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMcpModeSheetOpen, setIsMcpModeSheetOpen] = useState(false);
  const [defaultModelPreference] = usePreference('chat.default_model_id');
  const [form, setForm] = useState<AssistantFormState>(() => createFormState(assistant));
  const [hasPickedModel, setHasPickedModel] = useState(false);
  const [appliedPickedModelId, setAppliedPickedModelId] = useState<string | undefined>(undefined);
  const [seededModelId, setSeededModelId] = useState<UniqueModelId | null>(null);
  const selectedModel = modelPickerData.getModelItem(form.modelId);
  // Resolving through the picker catalog keeps a stale preference (a model the
  // user has since removed) from being seeded, which the create endpoint would
  // reject as an unregistered model.
  const defaultModelId = modelPickerData.getModelItem(defaultModelPreference)?.modelId ?? null;
  const isSaving = isCreating || isUpdating;

  // The picker is a pushed screen, so its choice comes back as a route param:
  // this form is unsaved state and nothing else can write into it. Resolved
  // through the catalog for the same reason the default is below, and because
  // an unresolved id here means the catalog has not loaded yet — leaving the
  // param unapplied lets a later render pick it up.
  const pickedModel = modelPickerData.getModelItem(pickedModelId ?? null);

  if (pickedModel && pickedModelId !== appliedPickedModelId) {
    setAppliedPickedModelId(pickedModelId);
    setHasPickedModel(true);
    setForm((current) => ({ ...current, modelId: pickedModel.modelId }));
  }

  // New assistants start on the global default model, like the desktop create
  // wizard. Both the preference and the model catalog load asynchronously, so
  // keep following them until the user picks a model themselves — after that a
  // late-arriving default must not overwrite the deliberate choice. Editing an
  // existing assistant never seeds: its empty `modelId` is a real stored state.
  if (!isEditing && !hasPickedModel && defaultModelId !== seededModelId) {
    setSeededModelId(defaultModelId);
    setForm((current) => ({ ...current, modelId: defaultModelId }));
  }

  const updateForm = useCallback(
    <TKey extends keyof AssistantFormState>(key: TKey, value: AssistantFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );
  const openModelSelect = useCallback(() => {
    Keyboard.dismiss();
    router.push({
      params: { assistantId, modelId: form.modelId ?? undefined },
      pathname: '/assistants/model-select',
    });
  }, [assistantId, form.modelId, router]);
  const openEmojiPicker = useCallback(() => {
    Keyboard.dismiss();
    setIsEmojiPickerOpen(true);
  }, []);
  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
  }, []);
  const handleEmojiSelect = useCallback((emoji: string) => {
    setForm((current) => ({ ...current, emoji }));
  }, []);
  const toggleMcpServer = useCallback((serverId: string, selected: boolean) => {
    setForm((current) => ({
      ...current,
      mcpServerIds: selected
        ? [...new Set([...current.mcpServerIds, serverId])]
        : current.mcpServerIds.filter((id) => id !== serverId),
    }));
  }, []);
  const mcpModeOptions = useMemo(
    () => [
      { label: t('assistant.form.mcpMode.disabled'), value: 'disabled' as McpMode },
      { label: t('assistant.form.mcpMode.auto'), value: 'auto' as McpMode },
      { label: t('assistant.form.mcpMode.manual'), value: 'manual' as McpMode },
    ],
    [t],
  );
  const selectedMcpMode = mcpModeOptions.find((option) => option.value === form.mcpMode);
  const openMcpModeSheet = useCallback(() => {
    Keyboard.dismiss();
    setIsMcpModeSheetOpen(true);
  }, []);
  const closeMcpModeSheet = useCallback(() => {
    setIsMcpModeSheetOpen(false);
  }, []);
  const handleMcpModeSelect = useCallback((value: McpMode) => {
    setForm((current) => ({ ...current, mcpMode: value }));
  }, []);
  const handleSave = useCallback(async () => {
    const dto = buildAssistantDto(form, assistant?.settings);

    if (!dto.ok) {
      alert.show({ title: t(dto.errorKey) });
      return;
    }

    try {
      if (assistantId) {
        await updateAssistant(assistantId, dto.value);
      } else {
        await createAssistant(dto.value);
      }

      router.back();
    } catch {
      alert.show({ title: t('assistant.toast.saveFailed') });
    }
  }, [alert, assistant?.settings, assistantId, createAssistant, form, router, t, updateAssistant]);
  const title = isEditing ? t('assistant.edit.title') : t('assistant.create.title');
  const saveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: isSaving,
        key: 'save',
        label: isSaving ? t('assistant.form.saving') : t('common.save'),
        onPress: () => {
          void handleSave();
        },
      },
    ],
    [handleSave, isSaving, t],
  );

  return (
    <>
      <BackHeader rightActions={saveActions} title={title} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FormSection title={t('assistant.form.basicSection')}>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityLabel={t('assistant.form.emoji')}
              accessibilityRole="button"
              className="min-h-10 min-w-10 items-center justify-center rounded-lg border border-border active:opacity-70"
              onPress={openEmojiPicker}
            >
              <Text className="text-emoji-2xl" style={styles.emojiGlyph}>
                {form.emoji.trim() || defaultEmoji}
              </Text>
            </Pressable>
            <TextField className="min-w-0 flex-1">
              <Input
                accessibilityLabel={t('assistant.form.name')}
                autoCorrect={false}
                onChangeText={(value) => updateForm('name', value)}
                placeholder={t('assistant.form.namePlaceholder')}
                returnKeyType="next"
                value={form.name}
              />
            </TextField>
          </View>
          <FormField label={t('assistant.form.description')}>
            <Input
              accessibilityLabel={t('assistant.form.description')}
              autoCorrect
              onChangeText={(value) => updateForm('description', value)}
              placeholder={t('assistant.form.descriptionPlaceholder')}
              value={form.description}
            />
          </FormField>
          <FormField label={t('assistant.form.prompt')}>
            <Input
              accessibilityLabel={t('assistant.form.prompt')}
              autoCorrect
              multiline
              onChangeText={(value) => updateForm('prompt', value)}
              placeholder={t('assistant.form.promptPlaceholder')}
              value={form.prompt}
            />
          </FormField>
        </FormSection>
        <FormSection title={t('assistant.form.generationSection')}>
          {/* A pushed screen rather than a sheet, and drawn as the settings'
              default-model row is: the label on the left, the model on the
              right, a chevron for the push. Picking a model is a search through
              every model on the device, which wants a screen of its own. */}
          <Pressable
            accessibilityLabel={t('assistant.form.modelSelect')}
            accessibilityRole="button"
            className="min-h-10 flex-row items-center justify-between gap-4 active:opacity-70"
            onPress={openModelSelect}
          >
            <Text className="min-w-0 flex-1 font-medium text-base text-foreground">
              {t('assistant.form.modelSelect')}
            </Text>
            <View className="min-w-0 max-w-[62%] flex-row items-center justify-end gap-1">
              <Text
                className="min-w-0 shrink text-right text-base text-foreground"
                numberOfLines={1}
              >
                {selectedModel?.model.name ?? t('assistant.model.none')}
              </Text>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </View>
          </Pressable>
          <SwitchRow
            label={t('assistant.form.enableTemperature')}
            value={form.enableTemperature}
            onValueChange={(value) => updateForm('enableTemperature', value)}
          />
          {form.enableTemperature ? (
            <NumberField
              accessibilityLabel={t('assistant.form.temperature')}
              value={form.temperature}
              onChangeText={(value) => updateForm('temperature', value)}
            />
          ) : null}
          <SwitchRow
            label={t('assistant.form.enableTopP')}
            value={form.enableTopP}
            onValueChange={(value) => updateForm('enableTopP', value)}
          />
          {form.enableTopP ? (
            <NumberField
              accessibilityLabel={t('assistant.form.topP')}
              value={form.topP}
              onChangeText={(value) => updateForm('topP', value)}
            />
          ) : null}
          <SwitchRow
            label={t('assistant.form.enableMaxTokens')}
            value={form.enableMaxTokens}
            onValueChange={(value) => updateForm('enableMaxTokens', value)}
          />
          {form.enableMaxTokens ? (
            <NumberField
              accessibilityLabel={t('assistant.form.maxTokens')}
              inputMode="numeric"
              value={form.maxTokens}
              onChangeText={(value) => updateForm('maxTokens', value)}
            />
          ) : null}
          <SwitchRow
            label={t('assistant.form.streamOutput')}
            value={form.streamOutput}
            onValueChange={(value) => updateForm('streamOutput', value)}
          />
          <FormField
            label={t('assistant.form.customParameters')}
            description={t('assistant.form.customParametersDescription')}
          >
            <Input
              accessibilityLabel={t('assistant.form.customParameters')}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={(value) => updateForm('customParametersJson', value)}
              placeholder="[]"
              spellCheck={false}
              value={form.customParametersJson}
            />
          </FormField>
        </FormSection>
        <FormSection title={t('assistant.form.mcpSection')}>
          <SwitchRow
            label={t('assistant.form.enableMaxToolCalls')}
            value={form.enableMaxToolCalls}
            onValueChange={(value) => updateForm('enableMaxToolCalls', value)}
          />
          {form.enableMaxToolCalls ? (
            <NumberField
              accessibilityLabel={t('assistant.form.maxToolCalls')}
              inputMode="numeric"
              value={form.maxToolCalls}
              onChangeText={(value) => updateForm('maxToolCalls', value)}
            />
          ) : null}
          <Pressable
            accessibilityLabel={t('assistant.form.mcpMode.label')}
            accessibilityRole="button"
            className="min-h-10 flex-row items-center justify-between gap-4 active:opacity-70"
            onPress={openMcpModeSheet}
          >
            <Text className="min-w-0 flex-1 font-medium text-base text-foreground">
              {t('assistant.form.mcpMode.label')}
            </Text>
            <View className="min-w-0 max-w-48 flex-row items-center justify-end gap-1">
              <Text
                className="min-w-0 shrink text-right text-base text-foreground"
                numberOfLines={1}
              >
                {selectedMcpMode?.label}
              </Text>
              <ChevronDownIcon className="size-5 shrink-0 text-foreground" />
            </View>
          </Pressable>
          {form.mcpMode === 'manual' ? (
            mcpServers.length > 0 ? (
              <View className="gap-3">
                {mcpServers.map((server) => (
                  <SwitchRow
                    key={server.id}
                    label={server.name}
                    value={form.mcpServerIds.includes(server.id)}
                    onValueChange={(selected) => toggleMcpServer(server.id, selected)}
                  />
                ))}
              </View>
            ) : (
              <Text className="text-foreground text-xs">{t('assistant.form.mcpNoServers')}</Text>
            )
          ) : null}
        </FormSection>
      </KeyboardAwareScrollView>
      <EmojiPickerBottomSheet
        isOpen={isEmojiPickerOpen}
        onClose={closeEmojiPicker}
        onSelect={handleEmojiSelect}
      />
      <SingleSelectionSheet
        closeAccessibilityLabel={t('common.close')}
        emptyText={t('settings.select.placeholder')}
        heightFraction={0.6}
        isOpen={isMcpModeSheetOpen}
        onClose={closeMcpModeSheet}
        onSelect={handleMcpModeSelect}
        options={mcpModeOptions}
        selectedValue={form.mcpMode}
        testID="assistant-mcp-mode-selection"
        title={t('assistant.form.mcpMode.label')}
      />
    </>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-foreground text-sm">{title}</Text>
      <View className="gap-4 rounded-2xl bg-grouped-surface p-4">{children}</View>
    </View>
  );
}

function FormField({
  children,
  description,
  label,
}: {
  children: React.ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <TextField>
      <Label>{label}</Label>
      {children}
      {description ? <Description selectable>{description}</Description> : null}
    </TextField>
  );
}

function SwitchRow({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View className="min-h-10 flex-row items-center justify-between gap-4">
      <Text className="min-w-0 flex-1 font-medium text-base text-foreground" numberOfLines={2}>
        {label}
      </Text>
      <Switch accessibilityLabel={label} onValueChange={onValueChange} value={value} />
    </View>
  );
}

function NumberField({
  accessibilityLabel,
  inputMode = 'decimal',
  onChangeText,
  value,
}: {
  accessibilityLabel: string;
  inputMode?: 'decimal' | 'numeric';
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <TextField>
      <Input
        accessibilityLabel={accessibilityLabel}
        inputMode={inputMode}
        keyboardType={inputMode === 'numeric' ? 'number-pad' : 'decimal-pad'}
        onChangeText={onChangeText}
        placeholder="0"
        value={value}
      />
    </TextField>
  );
}

function createFormState(assistant?: Assistant): AssistantFormState {
  const settings = assistant?.settings ?? DEFAULT_ASSISTANT_SETTINGS;

  return {
    customParametersJson: JSON.stringify(settings.customParameters, null, 2),
    description: assistant?.description ?? '',
    emoji: assistant?.emoji ?? defaultEmoji,
    enableMaxTokens: settings.enableMaxTokens,
    enableMaxToolCalls: settings.enableMaxToolCalls,
    enableTemperature: settings.enableTemperature,
    enableTopP: settings.enableTopP,
    enableWebSearch: settings.enableWebSearch,
    maxTokens: String(settings.maxTokens),
    maxToolCalls: String(settings.maxToolCalls),
    mcpMode: settings.mcpMode,
    mcpServerIds: assistant?.mcpServerIds ?? [],
    modelId: assistant?.modelId ?? null,
    name: assistant?.name ?? '',
    prompt: assistant?.prompt ?? '',
    reasoningEffort: settings.reasoning_effort,
    streamOutput: settings.streamOutput,
    temperature: String(settings.temperature),
    topP: String(settings.topP),
  };
}

function buildAssistantDto(
  form: AssistantFormState,
  currentSettings?: AssistantSettings,
): { ok: true; value: CreateAssistantDto } | { errorKey: string; ok: false } {
  const name = form.name.trim();

  if (!name) {
    return { ok: false, errorKey: 'assistant.form.nameRequired' };
  }

  const temperature = Number(form.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, errorKey: 'assistant.form.temperatureInvalid' };
  }

  const topP = Number(form.topP);
  if (!Number.isFinite(topP) || topP < 0 || topP > 1) {
    return { ok: false, errorKey: 'assistant.form.topPInvalid' };
  }

  const maxTokens = Number(form.maxTokens);
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) {
    return { ok: false, errorKey: 'assistant.form.maxTokensInvalid' };
  }

  const maxToolCalls = Number(form.maxToolCalls);
  if (!Number.isSafeInteger(maxToolCalls) || maxToolCalls <= 0) {
    return { ok: false, errorKey: 'assistant.form.maxToolCallsInvalid' };
  }

  const customParameters = parseCustomParameters(form.customParametersJson);
  if (!customParameters.ok) {
    return { ok: false, errorKey: 'assistant.form.customParametersInvalid' };
  }

  return {
    ok: true,
    value: {
      description: form.description.trim(),
      emoji: form.emoji.trim() || defaultEmoji,
      mcpServerIds: form.mcpServerIds,
      modelId: form.modelId,
      name,
      prompt: form.prompt,
      settings: {
        ...(currentSettings ?? DEFAULT_ASSISTANT_SETTINGS),
        customParameters: customParameters.value,
        enableMaxTokens: form.enableMaxTokens,
        enableMaxToolCalls: form.enableMaxToolCalls,
        enableTemperature: form.enableTemperature,
        enableTopP: form.enableTopP,
        enableWebSearch: form.enableWebSearch,
        maxTokens,
        maxToolCalls,
        mcpMode: form.mcpMode,
        reasoning_effort: form.reasoningEffort,
        streamOutput: form.streamOutput,
        temperature,
        topP,
      },
    },
  };
}

function parseCustomParameters(
  value: string,
): { ok: true; value: AssistantSettings['customParameters'] } | { ok: false } {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { ok: true, value: [] };
  }

  try {
    const parsed = JSON.parse(trimmedValue);

    if (!Array.isArray(parsed)) {
      return { ok: false };
    }

    return { ok: true, value: parsed as AssistantSettings['customParameters'] };
  } catch {
    return { ok: false };
  }
}

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}

const styles = StyleSheet.create({
  emojiGlyph: {
    includeFontPadding: false,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 24,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
});
