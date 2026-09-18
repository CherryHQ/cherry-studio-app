import {
  BottomSheet,
  Button,
  ContentState,
  Input,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useRemoteAgent, useRemoteConnection } from '@/frontend/appShell/remoteAgent';
import type {
  ControllerInteraction,
  ControllerQuestion,
} from '@/shared/contracts/agent/controller';

import { getRemoteToolTitle } from './remoteToolTitle';

export function RemoteInteractionSheet({
  sessionId,
  interaction,
  onClose,
}: {
  sessionId: string;
  interaction: ControllerInteraction;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const query = useQuery({
    queryKey: [
      'agentController',
      connectionId,
      connection.sourceKey,
      sessionId,
      'interaction',
      interaction.id,
    ],
    queryFn: ({ signal }) => controller.interaction(sessionId, interaction.id, signal),
    staleTime: 0,
    retry: false,
  });
  const canRespond =
    interaction.canRespond &&
    connection.capabilities.respond &&
    connection.status === 'ready' &&
    query.isSuccess &&
    !submitting;
  const allAnswered =
    query.data?.questions?.every((question) => answers[question.question]?.trim()) ?? true;
  const submit = async (approved: boolean) => {
    if (!canRespond || lock.current) return;
    lock.current = true;
    setSubmitting(true);
    try {
      const result = await controller.respond(sessionId, interaction.id, {
        approved,
        ...(reason ? { reason } : {}),
        ...(approved && query.data?.questions ? { answers } : {}),
      });
      if (result.status === 'failed' || result.status === 'interrupted')
        toast.show({ label: t('remoteAgent.actionFailed'), variant: 'danger' });
      else onClose();
    } catch {
      toast.show({ label: t('remoteAgent.actionFailed'), variant: 'danger' });
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={getRemoteToolTitle(interaction.toolName, t)}
      size="large"
      footer={
        <View className="flex-row gap-3">
          <Button disabled={!canRespond} variant="destructive" onPress={() => void submit(false)}>
            {t('chat.tool.approval.deny')}
          </Button>
          <Button
            disabled={!canRespond || !allAnswered}
            loading={submitting}
            onPress={() => void submit(true)}
          >
            {t(query.data?.questions ? 'remoteAgent.submitAnswers' : 'chat.tool.approval.allow')}
          </Button>
        </View>
      }
    >
      <ScrollView contentContainerClassName="gap-4 px-6 pb-6" keyboardShouldPersistTaps="handled">
        {!interaction.canRespond ? (
          <Text className="text-muted-foreground">{t('remoteAgent.interactionUnavailable')}</Text>
        ) : null}
        {query.isPending ? (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        ) : query.isError ? (
          <ContentState.Error
            title={t('remoteAgent.interactionUnavailable')}
            primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
          />
        ) : null}
        {query.data?.questions ? (
          query.data.questions.map((question) => (
            <Question
              key={question.question}
              question={question}
              disabled={!canRespond}
              onAnswer={(answer) =>
                setAnswers((current) => ({ ...current, [question.question]: answer }))
              }
            />
          ))
        ) : query.data ? (
          <Text selectable className="font-mono text-sm text-foreground">
            {JSON.stringify(query.data.input, null, 2)}
          </Text>
        ) : null}
        <TextField>
          <TextField.Label>{t('remoteAgent.denialReason')}</TextField.Label>
          <Input
            accessibilityLabel={t('remoteAgent.denialReason')}
            value={reason}
            onChangeText={setReason}
            maxLength={4096}
            multiline
          />
        </TextField>
      </ScrollView>
    </BottomSheet>
  );
}
function Question({
  question,
  disabled,
  onAnswer,
}: {
  question: ControllerQuestion;
  disabled: boolean;
  onAnswer(answer: string): void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const select = (label: string) => {
    const next = question.multiple
      ? selected.includes(label)
        ? selected.filter((value) => value !== label)
        : [...selected, label]
      : selected.includes(label)
        ? []
        : [label];
    setSelected(next);
    if (!question.multiple) setFreeText('');
    onAnswer(
      [...next, ...(question.multiple && freeText.trim() ? [freeText.trim()] : [])].join(', '),
    );
  };
  return (
    <View className="gap-2">
      <Text className="font-medium text-base text-foreground">{question.question}</Text>
      {question.options.map((option) => (
        <Button
          key={option.label}
          disabled={disabled}
          accessibilityRole={question.multiple ? 'checkbox' : 'radio'}
          accessibilityState={{ checked: selected.includes(option.label) }}
          variant={selected.includes(option.label) ? 'secondary' : 'outline'}
          onPress={() => select(option.label)}
        >
          {[option.label, option.description].filter(Boolean).join('\n')}
        </Button>
      ))}
      <Input
        accessibilityLabel={t('remoteAgent.freeAnswer')}
        placeholder={t('remoteAgent.freeAnswer')}
        value={freeText}
        editable={!disabled}
        multiline
        onChangeText={(text) => {
          setFreeText(text);
          if (!question.multiple) setSelected([]);
          onAnswer(
            [...(question.multiple ? selected : []), text.trim()].filter(Boolean).join(', '),
          );
        }}
      />
    </View>
  );
}
