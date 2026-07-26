import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from 'heroui-native/input';
import { Switch } from 'heroui-native/switch';
import { TextArea } from 'heroui-native/text-area';
import { useToast } from 'heroui-native/toast';
import { ChevronDownIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import {
  ModelPickerBottomSheet,
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/components/modelPicker';
import { keyboardBottomOffset } from '@/config/constants';
import type { CreateAssistantDto } from '@/data/api/schemas/assistants';
import { usePreference } from '@/data/hooks';
import {
  type Assistant,
  type AssistantSettings,
  DEFAULT_ASSISTANT_SETTINGS,
  type McpMode,
} from '@/data/types/assistant';
import type { UniqueModelId } from '@/data/types/model';
import { useAssistantApiById, useAssistantMutations } from '@/hooks/chat';
import { useMcpServersApi } from '@/hooks/mcp/useMcpServers';
import { SettingSelect } from '../SettingsScreen/components/SettingSelect';
import { EmojiPickerBottomSheet } from './components/EmojiPickerBottomSheet';

type AssistantFormState = {
  customParametersJson: string;
  description: string;
  emoji: string;
  enableMaxTokens: boolean;
  enableTemperature: boolean;
  enableTopP: boolean;
  enableWebSearch: boolean;
  maxTokens: string;
  mcpMode: McpMode;
  mcpServerIds: string[];
  modelId: UniqueModelId | null;
  name: string;
  prompt: string;
  reasoningEffort: string;
  temperature: string;
  topP: string;
};

const defaultEmoji = '🌟';

export default function AssistantEditScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ assistantId?: string | string[] }>();
  const assistantId = getSingleParamValue(params.assistantId);
  const { assistant, isLoading } = useAssistantApiById(assistantId);

  // The form seeds its fields from the record when it mounts, so it must not mount
  // before the record is there — an empty form that reseeds a commit later would throw
  // away whatever the user had already typed into it.
  if (assistantId && isLoading) {
    return (
      <>
        <BackHeader title={t('assistant.edit.title')} />
        <View className="p-4">
          <Text className="text-center text-default-foreground text-sm">
            {t('assistant.form.loading')}
          </Text>
        </View>
      </>
    );
  }

  return <AssistantEditForm assistant={assistant} assistantId={assistantId} />;
}

function AssistantEditForm({
  assistant,
  assistantId,
}: {
  assistant: Assistant | undefined;
  assistantId: string | undefined;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = Boolean(assistantId);
  const { createAssistant, isCreating, isUpdating, updateAssistant } = useAssistantMutations();
  const modelPickerData = useModelPickerData();
  const { servers: mcpServers } = useMcpServersApi();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [defaultModelPreference] = usePreference('chat.default_model_id');
  const [form, setForm] = useState<AssistantFormState>(() => createFormState(assistant));
  const [hasPickedModel, setHasPickedModel] = useState(false);
  const [seededModelId, setSeededModelId] = useState<UniqueModelId | null>(null);
  const selectedModel = modelPickerData.getModelItem(form.modelId);
  // Resolving through the picker catalog keeps a stale preference (a model the
  // user has since removed) from being seeded, which the create endpoint would
  // reject as an unregistered model.
  const defaultModelId = modelPickerData.getModelItem(defaultModelPreference)?.modelId ?? null;
  const isSaving = isCreating || isUpdating;

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
  const openModelPicker = useCallback(() => {
    Keyboard.dismiss();
    setIsModelPickerOpen(true);
  }, []);
  const closeModelPicker = useCallback(() => {
    setIsModelPickerOpen(false);
  }, []);
  const handleModelSelect = useCallback((item: ModelPickerModelItem) => {
    setHasPickedModel(true);
    setForm((current) => ({ ...current, modelId: item.modelId }));
  }, []);
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
  const handleSave = useCallback(async () => {
    const dto = buildAssistantDto(form, assistant?.settings);

    if (!dto.ok) {
      toast.show({ label: t(dto.errorKey), variant: 'danger' });
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
      toast.show({
        label: t('assistant.toast.saveFailed'),
        variant: 'danger',
      });
    }
  }, [assistant?.settings, assistantId, createAssistant, form, router, t, toast, updateAssistant]);
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
              className="size-12 items-center justify-center rounded-2xl border border-border active:opacity-70"
              onPress={openEmojiPicker}
            >
              <Text className="text-2xl" style={styles.emojiGlyph}>
                {form.emoji.trim() || defaultEmoji}
              </Text>
            </Pressable>
            <View className="min-w-0 flex-1">
              <Input
                accessibilityLabel={t('assistant.form.name')}
                autoCorrect={false}
                variant="secondary"
                className="rounded-2xl px-4 text-base text-foreground leading-5"
                onChangeText={(value) => updateForm('name', value)}
                placeholder={t('assistant.form.namePlaceholder')}
                placeholderColorClassName="accent-muted"
                returnKeyType="next"
                style={styles.textInput}
                value={form.name}
              />
            </View>
          </View>
          <FormField label={t('assistant.form.description')}>
            <Input
              accessibilityLabel={t('assistant.form.description')}
              autoCorrect
              variant="secondary"
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              onChangeText={(value) => updateForm('description', value)}
              placeholder={t('assistant.form.descriptionPlaceholder')}
              placeholderColorClassName="accent-muted"
              style={styles.textInput}
              value={form.description}
            />
          </FormField>
          <FormField label={t('assistant.form.prompt')}>
            <TextArea
              accessibilityLabel={t('assistant.form.prompt')}
              autoCorrect
              variant="secondary"
              className="min-h-32 rounded-2xl px-4 text-base text-foreground leading-5"
              multiline
              onChangeText={(value) => updateForm('prompt', value)}
              placeholder={t('assistant.form.promptPlaceholder')}
              placeholderColorClassName="accent-muted"
              style={styles.textArea}
              value={form.prompt}
            />
          </FormField>
        </FormSection>
        <FormSection title={t('assistant.form.generationSection')}>
          <Pressable
            accessibilityLabel={t('assistant.form.model')}
            accessibilityRole="button"
            className="min-h-12 flex-row items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2 active:opacity-70"
            onPress={openModelPicker}
          >
            {selectedModel ? (
              <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={1}>
                {selectedModel.provider.name}
              </Text>
            ) : (
              <Text className="min-w-0 flex-1 text-base text-default-foreground" numberOfLines={1}>
                {t('assistant.model.none')}
              </Text>
            )}
            <View className="max-w-[60%] flex-row items-center justify-end gap-2">
              {selectedModel ? (
                <>
                  <ModelPickerIcon item={selectedModel} size={20} />
                  <Text
                    className="min-w-0 shrink text-right text-default-foreground text-sm"
                    numberOfLines={1}
                  >
                    {selectedModel.model.name}
                  </Text>
                </>
              ) : null}
              <ChevronDownIcon className="size-6 text-default-foreground" strokeWidth={2} />
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
          <FormField
            label={t('assistant.form.customParameters')}
            description={t('assistant.form.customParametersDescription')}
          >
            <TextArea
              accessibilityLabel={t('assistant.form.customParameters')}
              autoCapitalize="none"
              variant="secondary"
              autoCorrect={false}
              className="min-h-28 rounded-2xl px-4 font-mono text-sm text-foreground leading-5"
              multiline
              onChangeText={(value) => updateForm('customParametersJson', value)}
              placeholder="[]"
              placeholderColorClassName="accent-muted"
              spellCheck={false}
              style={styles.textArea}
              value={form.customParametersJson}
            />
          </FormField>
        </FormSection>
        <FormSection title={t('assistant.form.mcpSection')}>
          <View className="min-h-10 flex-row items-center justify-between gap-4">
            <Text className="min-w-0 flex-1 font-medium text-base text-foreground">
              {t('assistant.form.mcpMode.label')}
            </Text>
            <SettingSelect
              label={t('assistant.form.mcpMode.label')}
              options={mcpModeOptions}
              value={form.mcpMode}
              onValueChange={(value) => updateForm('mcpMode', value)}
            />
          </View>
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
              <Text className="text-default-foreground text-xs">
                {t('assistant.form.mcpNoServers')}
              </Text>
            )
          ) : null}
        </FormSection>
      </KeyboardAwareScrollView>
      <ModelPickerBottomSheet
        isOpen={isModelPickerOpen}
        selectedModelId={form.modelId}
        onClose={closeModelPicker}
        onSelect={handleModelSelect}
      />
      <EmojiPickerBottomSheet
        isOpen={isEmojiPickerOpen}
        onClose={closeEmojiPicker}
        onSelect={handleEmojiSelect}
      />
    </>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-default-foreground text-sm">{title}</Text>
      <View className="gap-4 rounded-2xl bg-settings-grouped-surface p-4">{children}</View>
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
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{label}</Text>
      {children}
      {description ? (
        <Text className="text-default-foreground text-xs" selectable>
          {description}
        </Text>
      ) : null}
    </View>
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
      <Text className="min-w-0 flex-1 font-medium text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Switch isSelected={value} onSelectedChange={onValueChange} />
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
    <Input
      accessibilityLabel={accessibilityLabel}
      className="rounded-2xl px-4 text-base text-foreground leading-5"
      variant="secondary"
      inputMode={inputMode}
      keyboardType={inputMode === 'numeric' ? 'number-pad' : 'decimal-pad'}
      onChangeText={onChangeText}
      placeholder="0"
      placeholderColorClassName="accent-muted"
      style={styles.textInput}
      value={value}
    />
  );
}

function createFormState(assistant?: Assistant): AssistantFormState {
  const settings = assistant?.settings ?? DEFAULT_ASSISTANT_SETTINGS;

  return {
    customParametersJson: JSON.stringify(settings.customParameters, null, 2),
    description: assistant?.description ?? '',
    emoji: assistant?.emoji ?? defaultEmoji,
    enableMaxTokens: settings.enableMaxTokens,
    enableTemperature: settings.enableTemperature,
    enableTopP: settings.enableTopP,
    enableWebSearch: settings.enableWebSearch,
    maxTokens: String(settings.maxTokens),
    mcpMode: settings.mcpMode,
    mcpServerIds: assistant?.mcpServerIds ?? [],
    modelId: assistant?.modelId ?? null,
    name: assistant?.name ?? '',
    prompt: assistant?.prompt ?? '',
    reasoningEffort: settings.reasoning_effort,
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
        enableTemperature: form.enableTemperature,
        enableTopP: form.enableTopP,
        enableWebSearch: form.enableWebSearch,
        maxTokens,
        mcpMode: form.mcpMode,
        reasoning_effort: form.reasoningEffort,
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
  textArea: {
    includeFontPadding: false,
    paddingBottom: 12,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  textInput: {
    includeFontPadding: false,
    minHeight: 48,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});
