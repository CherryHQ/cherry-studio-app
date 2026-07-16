import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from 'heroui-native/input';
import { Switch } from 'heroui-native/switch';
import { TextArea } from 'heroui-native/text-area';
import { useToast } from 'heroui-native/toast';
import { ChevronsUpDownIcon, XIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmojiPickerBottomSheet } from '@/components/emojiPicker';
import { CloseHeader, type CloseHeaderAction } from '@/components/headers';
import {
  ModelPickerBottomSheet,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/components/modelPicker';
import type { CreateAssistantDto } from '@/data/api/schemas/assistants';
import {
  type Assistant,
  type AssistantSettings,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@/data/types/assistant';
import type { UniqueModelId } from '@/data/types/model';
import { useAssistantApiById, useAssistantMutations } from '@/hooks/chat';

type AssistantFormState = {
  customParametersJson: string;
  description: string;
  emoji: string;
  enableMaxTokens: boolean;
  enableTemperature: boolean;
  enableTopP: boolean;
  enableWebSearch: boolean;
  maxTokens: string;
  modelId: UniqueModelId | null;
  name: string;
  prompt: string;
  reasoningEffort: string;
  temperature: string;
  topP: string;
};

const defaultEmoji = '🌟';
const reasoningEffortOptions = ['default', 'minimal', 'low', 'medium', 'high'] as const;

export default function AssistantEditScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ assistantId?: string | string[] }>();
  const assistantId = getSingleParamValue(params.assistantId);
  const isEditing = Boolean(assistantId);
  const { assistant, isLoading } = useAssistantApiById(assistantId);
  const { createAssistant, isCreating, isUpdating, updateAssistant } = useAssistantMutations();
  const modelPickerData = useModelPickerData();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [form, setForm] = useState<AssistantFormState>(() => createFormState());
  const selectedModel = modelPickerData.getModelItem(form.modelId);
  const isSaving = isCreating || isUpdating;

  useEffect(() => {
    if (assistant) {
      setForm(createFormState(assistant));
    }
  }, [assistant]);

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
  const clearModel = useCallback(() => {
    setForm((current) => ({ ...current, modelId: null }));
  }, []);
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
  const saveActions = useMemo<CloseHeaderAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: isSaving,
        key: 'save',
        label: isSaving ? t('assistant.form.saving') : t('common.save'),
        onPress: () => {
          void handleSave();
        },
        variant: 'prominent',
      },
    ],
    [handleSave, isSaving, t],
  );

  return (
    <>
      <CloseHeader rightActions={saveActions} title={title} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 pt-5 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading && isEditing ? (
          <Text className="text-center text-default-foreground text-sm">
            {t('assistant.form.loading')}
          </Text>
        ) : (
          <>
            <FormSection title={t('assistant.form.basicSection')}>
              <FormField label={t('assistant.form.name')}>
                <Input
                  accessibilityLabel={t('assistant.form.name')}
                  autoCorrect={false}
                  className="rounded-2xl px-4 text-base text-foreground leading-5"
                  onChangeText={(value) => updateForm('name', value)}
                  placeholder={t('assistant.form.namePlaceholder')}
                  placeholderColorClassName="accent-muted"
                  returnKeyType="next"
                  style={styles.textInput}
                  value={form.name}
                />
              </FormField>
              <FormField label={t('assistant.form.emoji')}>
                <Pressable
                  accessibilityLabel={t('assistant.form.emoji')}
                  accessibilityRole="button"
                  className="min-h-12 flex-row items-center justify-between gap-3 rounded-2xl bg-field px-4 active:opacity-70"
                  onPress={openEmojiPicker}
                >
                  <Text className="text-2xl">{form.emoji.trim() || defaultEmoji}</Text>
                  <ChevronsUpDownIcon className="size-5 text-default-foreground" strokeWidth={2} />
                </Pressable>
              </FormField>
              <FormField label={t('assistant.form.description')}>
                <Input
                  accessibilityLabel={t('assistant.form.description')}
                  autoCorrect
                  className="rounded-2xl px-4 text-base text-foreground leading-5"
                  onChangeText={(value) => updateForm('description', value)}
                  placeholder={t('assistant.form.descriptionPlaceholder')}
                  placeholderColorClassName="accent-muted"
                  style={styles.textInput}
                  value={form.description}
                />
              </FormField>
              <FormField label={t('assistant.form.model')}>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityLabel={t('assistant.form.model')}
                    accessibilityRole="button"
                    className="min-h-12 min-w-0 flex-1 flex-row items-center justify-between gap-3 rounded-2xl bg-field px-4 active:opacity-70"
                    onPress={openModelPicker}
                  >
                    <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={1}>
                      {selectedModel?.model.name ?? t('assistant.model.none')}
                    </Text>
                    <ChevronsUpDownIcon
                      className="size-5 text-default-foreground"
                      strokeWidth={2}
                    />
                  </Pressable>
                  {form.modelId ? (
                    <Pressable
                      accessibilityLabel={t('common.clear')}
                      accessibilityRole="button"
                      className="size-11 items-center justify-center rounded-full bg-surface-secondary active:opacity-70"
                      onPress={clearModel}
                    >
                      <XIcon className="size-5 text-default-foreground" strokeWidth={2.25} />
                    </Pressable>
                  ) : null}
                </View>
              </FormField>
              <FormField label={t('assistant.form.prompt')}>
                <TextArea
                  accessibilityLabel={t('assistant.form.prompt')}
                  autoCorrect
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
              <SwitchRow
                label={t('assistant.form.enableTemperature')}
                value={form.enableTemperature}
                onValueChange={(value) => updateForm('enableTemperature', value)}
              />
              <NumberField
                disabled={!form.enableTemperature}
                label={t('assistant.form.temperature')}
                value={form.temperature}
                onChangeText={(value) => updateForm('temperature', value)}
              />
              <SwitchRow
                label={t('assistant.form.enableTopP')}
                value={form.enableTopP}
                onValueChange={(value) => updateForm('enableTopP', value)}
              />
              <NumberField
                disabled={!form.enableTopP}
                label={t('assistant.form.topP')}
                value={form.topP}
                onChangeText={(value) => updateForm('topP', value)}
              />
              <SwitchRow
                label={t('assistant.form.enableMaxTokens')}
                value={form.enableMaxTokens}
                onValueChange={(value) => updateForm('enableMaxTokens', value)}
              />
              <NumberField
                disabled={!form.enableMaxTokens}
                inputMode="numeric"
                label={t('assistant.form.maxTokens')}
                value={form.maxTokens}
                onChangeText={(value) => updateForm('maxTokens', value)}
              />
              <SwitchRow
                label={t('assistant.form.enableWebSearch')}
                value={form.enableWebSearch}
                onValueChange={(value) => updateForm('enableWebSearch', value)}
              />
              <FormField label={t('assistant.form.reasoningEffort')}>
                <View className="flex-row flex-wrap gap-2">
                  {reasoningEffortOptions.map((option) => (
                    <Pressable
                      key={option}
                      accessibilityLabel={t(`chat.reasoning.${option}`)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: form.reasoningEffort === option }}
                      className={
                        form.reasoningEffort === option
                          ? 'rounded-full bg-foreground px-3 py-2 active:opacity-80'
                          : 'rounded-full bg-surface-secondary px-3 py-2 active:opacity-70'
                      }
                      onPress={() => updateForm('reasoningEffort', option)}
                    >
                      <Text
                        className={
                          form.reasoningEffort === option
                            ? 'font-semibold text-background text-sm'
                            : 'font-semibold text-foreground text-sm'
                        }
                      >
                        {t(`chat.reasoning.${option}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </FormField>
            </FormSection>
            <FormSection title={t('assistant.form.advancedSection')}>
              <FormField
                label={t('assistant.form.customParameters')}
                description={t('assistant.form.customParametersDescription')}
              >
                <TextArea
                  accessibilityLabel={t('assistant.form.customParameters')}
                  autoCapitalize="none"
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
          </>
        )}
      </ScrollView>
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
  disabled,
  inputMode = 'decimal',
  label,
  onChangeText,
  value,
}: {
  disabled?: boolean;
  inputMode?: 'decimal' | 'numeric';
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <FormField label={label}>
      <Input
        accessibilityLabel={label}
        className="rounded-2xl px-4 text-base text-foreground leading-5 disabled:opacity-50"
        editable={!disabled}
        inputMode={inputMode}
        keyboardType={inputMode === 'numeric' ? 'number-pad' : 'decimal-pad'}
        onChangeText={onChangeText}
        placeholder="0"
        placeholderColorClassName="accent-muted"
        style={styles.textInput}
        value={value}
      />
    </FormField>
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
