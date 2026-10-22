import {
  Button,
  Chip,
  ContentState,
  Input,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { aiFailureReasonTitleKey } from '@/frontend/components/AiFailure';
import {
  ModelPickerDrawer,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { queryKeys, useBackendModule, usePreference } from '@/frontend/data';
import {
  AVATAR_STUDIO_EXPRESSIONS,
  type AvatarStudioExpression,
  type AvatarStudioStep,
} from '@/shared/contracts/avatarStudio';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

const EXPRESSION_KEYS = {
  blink: 'agent.avatarStudio.create.blink',
  thinking: 'agent.avatarStudio.status.running',
  waiting: 'agent.avatarStudio.status.waiting',
  done: 'agent.avatarStudio.status.completed',
  error: 'agent.avatarStudio.status.failed',
} as const;
const compatible = ({ model }: ModelPickerModelItem) =>
  Boolean(model.imageGeneration?.modes.generate && model.imageGeneration.modes.edit);

/** Bounded, user-approved steps over a persisted draft; closing cancels work and keeps results. */
export function AvatarCreation({
  onReady,
  onBack,
}: {
  onReady: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { studio } = useBackendModule('avatars');
  const [defaultModel] = usePreference('feature.paintings.default_model_id');
  const [modelId, setModelId] = useState<UniqueModelId | null>(
    isUniqueModelId(defaultModel) ? defaultModel : null,
  );
  const models = useModelPickerData({ modelType: 'image' });
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [keyColor, setKeyColor] = useState<'green' | 'magenta'>('green');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const running = useRef(false);
  const query = useQuery({
    queryKey: queryKeys.avatars.studio(),
    queryFn: () => studio.get(),
    networkMode: 'always',
    refetchInterval: (state) => (pending || state.state.data?.active ? 750 : false),
  });
  useEffect(
    () => () => {
      studio.cancel();
    },
    [studio],
  );
  const draft = query.data?.draft;
  const selectedModel = models.getModelItem(draft?.modelId ?? modelId);
  const busy = pending || Boolean(query.data?.active);
  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setErrorKey(null);
    try {
      await action();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setErrorKey(
          error instanceof Error && error.message === 'avatar_model_unsupported'
            ? 'agent.avatarStudio.create.modelRequired'
            : 'agent.avatarStudio.create.failed',
        );
    } finally {
      await query.refetch();
      running.current = false;
      setPending(false);
    }
  };
  const generate = (step: AvatarStudioStep, count: number) => {
    if (!draft || busy) return;
    alert.confirm({
      title: t('agent.avatarStudio.create.approveTitle'),
      description: t('agent.avatarStudio.create.approve', {
        imageCount: count,
        model: selectedModel?.model.name ?? draft.modelId,
      }),
      confirmLabel: t('common.ok'),
      onConfirm: () => run(() => studio.generate(draft.id, step)),
    });
  };
  const retry = (expression: AvatarStudioExpression) => {
    if (draft) void run(() => studio.retryExpression(draft.id, expression));
  };
  const missing = AVATAR_STUDIO_EXPRESSIONS.filter((expression) => !draft?.expressions[expression]);
  const selected = draft?.candidates.find((frame) => frame.id === draft.selectedId);
  const activeKey = query.data?.active;
  const stage = !draft?.selectedId ? 1 : !draft.sampleConfirmed || missing.length ? 2 : 3;
  const storedError = draft?.error;
  const failureKey =
    storedError?.code === 'avatar_model_unsupported'
      ? 'agent.avatarStudio.create.modelRequired'
      : storedError?.code === 'avatar_alignment' || storedError?.code === 'avatar_framing'
        ? 'agent.avatarStudio.create.qualityFailed'
        : (aiFailureReasonTitleKey(storedError?.code) ?? errorKey);
  return (
    <ScrollView contentContainerClassName="gap-5 px-4 pb-8" keyboardShouldPersistTaps="handled">
      <Button variant="ghost" onPress={onBack}>
        {t('common.back')}
      </Button>
      <Text className="font-semibold text-foreground">
        {t('agent.avatarStudio.create.steps', { stage })}
      </Text>
      {query.isPending ? (
        <ContentState.Loading title={t('agent.avatarStudio.loading')} />
      ) : query.error ? (
        <ContentState.Error
          title={t('agent.avatarStudio.loadFailed')}
          primaryAction={{
            children: t('common.retry'),
            onPress: () => {
              void query.refetch();
            },
          }}
        />
      ) : !draft ? (
        <>
          <TextField>
            <TextField.Label>{t('agent.avatarStudio.create.name')}</TextField.Label>
            <Input
              accessibilityLabel={t('agent.avatarStudio.create.name')}
              value={name}
              onChangeText={setName}
              maxLength={40}
            />
          </TextField>
          <TextField>
            <TextField.Label>{t('agent.avatarStudio.create.prompt')}</TextField.Label>
            <Input
              accessibilityLabel={t('agent.avatarStudio.create.prompt')}
              value={prompt}
              onChangeText={setPrompt}
              multiline
              maxLength={2000}
            />
          </TextField>
          <Button variant="tonal" onPress={() => setPickerOpen(true)}>
            {selectedModel?.model.name ?? t('chat.model.select')}
          </Button>
          <Text className="text-sm text-muted-foreground">
            {t('agent.avatarStudio.create.modelRequired')}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t('agent.avatarStudio.create.keyColor')}
          </Text>
          <View className="flex-row gap-3">
            <Chip.Selectable
              selected={keyColor === 'green'}
              onSelectedChange={() => setKeyColor('green')}
            >
              {t('agent.avatarStudio.create.green')}
            </Chip.Selectable>
            <Chip.Selectable
              selected={keyColor === 'magenta'}
              onSelectedChange={() => setKeyColor('magenta')}
            >
              {t('agent.avatarStudio.create.magenta')}
            </Chip.Selectable>
          </View>
          <Button
            disabled={
              busy || !name.trim() || !prompt.trim() || !selectedModel || !compatible(selectedModel)
            }
            onPress={() => {
              if (modelId) void run(() => studio.start({ name, prompt, modelId, keyColor }));
            }}
          >
            {t('agent.avatarStudio.create.start')}
          </Button>
        </>
      ) : (
        <>
          <Text className="text-foreground">
            {draft.name} · {selectedModel?.model.name ?? draft.modelId}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t('agent.avatarStudio.create.savedProgress')}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {(selected ? [selected] : draft.candidates).map((frame, index) => (
              <Pressable
                key={frame.id}
                disabled={busy || Boolean(selected)}
                accessibilityRole="radio"
                accessibilityState={{ selected: frame.id === draft.selectedId }}
                accessibilityLabel={t('agent.avatarStudio.create.candidate', { number: index + 1 })}
                onPress={() => {
                  void run(() => studio.selectCandidate(draft.id, frame.id));
                }}
                className="gap-2"
              >
                <Image
                  source={{ uri: query.data?.images[frame.id] }}
                  style={{ width: 140, height: 140 }}
                  contentFit="contain"
                />
                <Text className="text-sm text-foreground">
                  {selected
                    ? t('agent.avatarStudio.create.reference')
                    : t('agent.avatarStudio.create.candidate', { number: index + 1 })}
                </Text>
              </Pressable>
            ))}
            {AVATAR_STUDIO_EXPRESSIONS.map((expression) => {
              const frame = draft.expressions[expression];
              if (!frame) return null;
              return (
                <View key={expression} className="gap-2">
                  <Image
                    accessibilityLabel={t(EXPRESSION_KEYS[expression])}
                    source={{ uri: query.data?.images[frame.id] }}
                    style={{ width: 140, height: 140 }}
                    contentFit="contain"
                  />
                  <Text className="text-sm text-foreground">{t(EXPRESSION_KEYS[expression])}</Text>
                  {!draft.characterId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onPress={() => retry(expression)}
                    >
                      {t('common.retry')}
                    </Button>
                  ) : null}
                </View>
              );
            })}
          </View>
          {!selected ? (
            draft.candidates.length < 2 ? (
              <Button
                disabled={busy}
                onPress={() => generate('candidates', 2 - draft.candidates.length)}
              >
                {t('agent.avatarStudio.create.candidates')}
              </Button>
            ) : (
              <Text className="text-sm text-muted-foreground">
                {t('agent.avatarStudio.create.pick')}
              </Text>
            )
          ) : !draft.expressions.blink ? (
            <Button disabled={busy} onPress={() => generate('sample', 1)}>
              {t('agent.avatarStudio.create.sample')}
            </Button>
          ) : !draft.sampleConfirmed ? (
            <>
              <Text className="text-sm text-muted-foreground">
                {t('agent.avatarStudio.create.reviewSample')}
              </Text>
              <Button
                disabled={busy}
                onPress={() => {
                  void run(() => studio.confirmSample(draft.id));
                }}
              >
                {t('agent.avatarStudio.create.confirmSample')}
              </Button>
            </>
          ) : missing.length ? (
            <Button disabled={busy} onPress={() => generate('expressions', missing.length)}>
              {t('agent.avatarStudio.create.remaining', { imageCount: missing.length })}
            </Button>
          ) : (
            <Button
              disabled={busy}
              onPress={() => {
                void run(async () => {
                  const id = await studio.save(draft.id);
                  onReady(id);
                });
              }}
            >
              {t('agent.avatarStudio.create.preview')}
            </Button>
          )}
          {busy ? (
            <>
              <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
                {t('agent.avatarStudio.create.working', {
                  stage:
                    activeKey && activeKey in EXPRESSION_KEYS
                      ? t(EXPRESSION_KEYS[activeKey as AvatarStudioExpression])
                      : t('agent.avatarStudio.create.candidates'),
                })}
              </Text>
              <Button variant="secondary" onPress={() => studio.cancel()}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onPress={() =>
                alert.confirm({
                  title: t('agent.avatarStudio.create.discard'),
                  description: t('agent.avatarStudio.create.discardHint'),
                  confirmLabel: t('common.discard'),
                  role: 'destructive',
                  onConfirm: () => run(() => studio.discard(draft.id)),
                })
              }
            >
              {t('agent.avatarStudio.create.discard')}
            </Button>
          )}
        </>
      )}
      {failureKey ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
          {t(failureKey)}
        </Text>
      ) : null}
      {storedError ? (
        <Text selectable className="text-xs text-muted-foreground">
          {t('agent.avatarStudio.create.diagnostic', { id: storedError.diagnosticId })}
        </Text>
      ) : null}
      <ModelPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        modelType="image"
        selectedModelId={modelId}
        isModelVisible={compatible}
        onSelect={(item) => {
          setModelId(item.modelId);
          setPickerOpen(false);
        }}
      />
    </ScrollView>
  );
}
