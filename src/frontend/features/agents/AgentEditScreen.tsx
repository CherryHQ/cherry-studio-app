import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import {
  ContentState,
  Description,
  Input,
  Label,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import {
  ModelPickerDrawer,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/modelPicker';
import { usePreference } from '@/frontend/data/hooks';
import { useAgentApiById, useAgentMutations } from '@/frontend/hooks/agent';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { Agent } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

import { type AgentFormState, buildAgentDto, createAgentFormState } from './agentForm';

export default function AgentEditScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ agentId?: string | string[] }>();
  const agentId = getSingleParamValue(params.agentId);
  const { agent, isLoading, refetch } = useAgentApiById(agentId);

  // The form seeds its fields from the record when it mounts, so it must not mount
  // before the record is there — an empty form that reseeds a commit later would throw
  // away whatever the user had already typed into it.
  if (agentId && isLoading) {
    return (
      <>
        <RouteHeader title={t('agent.edit.title')} />
        <ContentState.Loading className="p-4" title={t('agent.form.loading')} />
      </>
    );
  }

  if (agentId && !agent) {
    return (
      <>
        <RouteHeader title={t('agent.edit.title')} />
        <ContentState.Error
          className="p-4"
          primaryAction={{
            children: t('agent.actions.retry'),
            onPress: () => void refetch(),
          }}
          title={t('agent.form.loadFailed')}
        />
      </>
    );
  }

  return <AgentEditForm agent={agent} agentId={agentId} />;
}

function AgentEditForm({ agent, agentId }: { agent: Agent | undefined; agentId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const isEditing = Boolean(agentId);
  const { createAgent, isCreating, isUpdating, updateAgent } = useAgentMutations();
  const modelPickerData = useModelPickerData();
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [defaultModelPreference] = usePreference('agent.default_model_id');
  const [form, setForm] = useState<AgentFormState>(() => createAgentFormState(agent));
  const [hasPickedModel, setHasPickedModel] = useState(false);
  const [seededModelId, setSeededModelId] = useState<UniqueModelId | null>(null);
  const selectedModel = modelPickerData.getModelItem(form.modelId);
  // Resolving through the picker catalog keeps a stale preference (a model the
  // user has since removed) from being seeded, which the create endpoint would
  // reject as an unregistered model.
  const defaultModelId = modelPickerData.getModelItem(defaultModelPreference)?.modelId ?? null;
  const isSaving = isCreating || isUpdating;

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
  const handleSave = useCallback(async () => {
    const dto = buildAgentDto(form, {
      inheritDefaultModel: !agentId && !hasPickedModel,
    });

    if (!dto.ok) {
      alert.show({ title: t(dto.errorKey) });
      return;
    }

    try {
      if (agentId) {
        await updateAgent(agentId, dto.value);
      } else {
        await createAgent(dto.value);
      }

      router.back();
    } catch {
      alert.show({ title: t('agent.toast.saveFailed') });
    }
  }, [agentId, alert, createAgent, form, hasPickedModel, router, t, updateAgent]);
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
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FormSection title={t('agent.form.basicSection')}>
          <FormField label={t('agent.form.name')}>
            <Input
              accessibilityLabel={t('agent.form.name')}
              autoCorrect={false}
              onChangeText={(value) => updateForm('name', value)}
              placeholder={t('agent.form.namePlaceholder')}
              returnKeyType="next"
              value={form.name}
            />
          </FormField>
          <FormField label={t('agent.form.description')}>
            <Input
              accessibilityLabel={t('agent.form.description')}
              autoCorrect
              onChangeText={(value) => updateForm('description', value)}
              placeholder={t('agent.form.descriptionPlaceholder')}
              value={form.description}
            />
          </FormField>
          <FormField label={t('agent.form.instructions')}>
            <Input
              accessibilityLabel={t('agent.form.instructions')}
              autoCorrect
              multiline
              onChangeText={(value) => updateForm('instructions', value)}
              placeholder={t('agent.form.instructionsPlaceholder')}
              value={form.instructions}
            />
          </FormField>
        </FormSection>
        <FormSection title={t('agent.form.modelSection')}>
          <Pressable
            accessibilityLabel={t('agent.form.modelSelect')}
            accessibilityRole="button"
            className="min-h-10 flex-row items-center justify-between gap-4 active:opacity-70"
            onPress={openModelSelect}
          >
            <Text className="min-w-0 flex-1 font-medium text-base text-foreground">
              {t('agent.form.modelSelect')}
            </Text>
            <View className="min-w-0 max-w-[62%] flex-row items-center justify-end gap-1">
              <Text
                className="min-w-0 shrink text-right text-base text-foreground"
                numberOfLines={1}
              >
                {selectedModel?.model.name ?? t('agent.model.none')}
              </Text>
              <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
            </View>
          </Pressable>
        </FormSection>
      </KeyboardAwareScrollView>
      {isModelPickerOpen ? (
        <ModelPickerDrawer
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={form.modelId}
          title={t('agent.form.modelSelect')}
        />
      ) : null}
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

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}

const styles = StyleSheet.create({
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
