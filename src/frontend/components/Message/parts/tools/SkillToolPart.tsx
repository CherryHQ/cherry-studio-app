import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { Button, MessagePart } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  SkillActivationSchema,
  SkillIdSchema,
  skillContentHashHex,
} from '@/shared/data/types/skill';

import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

/** A load receipt is activity; its instruction body is not a completed user task. */
export function SkillToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const router = useRouter();
  const output = part.state === 'output-available' && isRecord(part.output) ? part.output : null;
  if (getToolName(part) === 'adapt_skill')
    return <SkillAdaptationPart part={part} output={output} />;
  if (getToolName(part) !== 'load_skill')
    return <SkillManagementPart part={part} output={output} />;
  const activation = SkillActivationSchema.safeParse(
    output?.status === 'ok' ? output.activation : null,
  );
  if (!activation.success) return <GenericToolPart part={part} />;
  return (
    <MessagePart.Tool
      icon={ToolCaseIcon}
      title={t('skills.activity.load')}
      state="complete"
      statusText={activation.data.name}
      testID="skill-load-receipt"
    >
      <View className="gap-2">
        <Text className="text-sm text-foreground" selectable>
          {activation.data.name}
        </Text>
        {typeof output?.description === 'string' ? (
          <Text className="text-sm text-muted-foreground" selectable>
            {output.description}
          </Text>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/skills/[skillId]',
              params: { skillId: activation.data.skillId },
            })
          }
        >
          {t('skills.activity.view')}
        </Button>
        {typeof output?.instructions === 'string' ? (
          <MessagePart.TextSection
            title={t('skills.activity.instructions', {
              revision: skillContentHashHex(activation.data.contentHash).slice(0, 12),
            })}
            value={output.instructions}
          />
        ) : null}
      </View>
    </MessagePart.Tool>
  );
}

function SkillAdaptationPart({
  part,
  output,
}: {
  part: ToolMessagePart;
  output: Record<string, unknown> | null;
}) {
  const { t } = useTranslation();
  if (!output || !['adapted', 'unchanged'].includes(String(output.status)))
    return <GenericToolPart part={part} />;
  const saved = output.status === 'adapted';
  const changes = Array.isArray(output.changes)
    ? output.changes.filter(
        (change): change is { before: string; after: string; reason: string } =>
          isRecord(change) &&
          typeof change.before === 'string' &&
          typeof change.after === 'string' &&
          typeof change.reason === 'string',
      )
    : [];
  return (
    <MessagePart.Tool
      icon={ToolCaseIcon}
      title={t('skills.adaptation.title')}
      state="complete"
      statusText={t(saved ? 'skills.adaptation.saved' : 'skills.adaptation.unchanged')}
      testID="skill-adaptation-receipt"
    >
      <View className="gap-4">
        <View className="gap-1">
          <Text className="font-semibold text-base text-foreground" selectable>
            {typeof output.name === 'string' ? output.name : ''}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t(
              saved
                ? output.instructionsLoaded === true
                  ? 'skills.adaptation.continue'
                  : 'skills.adaptation.reloadFailed'
                : 'skills.adaptation.unchanged',
            )}
          </Text>
        </View>
        {changes.map((change) => (
          <View key={change.before} className="gap-3">
            <Text className="font-medium text-sm text-foreground" selectable>
              {change.reason}
            </Text>
            <View className="overflow-hidden rounded-xl border border-border-subtle">
              <View className="gap-1.5 bg-secondary p-3">
                <Text className="font-medium text-xs text-muted-foreground" selectable>
                  {t('chat.question.before')}
                </Text>
                <Text className="text-sm text-foreground" selectable>
                  {change.before}
                </Text>
              </View>
              {change.after ? (
                <View className="gap-1.5 border-t border-border-subtle bg-success-subtle p-3">
                  <Text className="font-medium text-xs text-success-subtle-foreground" selectable>
                    {t('chat.question.after')}
                  </Text>
                  <Text className="text-sm text-success-subtle-foreground" selectable>
                    {change.after}
                  </Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 py-2.5">
                  <Text className="font-medium text-xs text-muted-foreground" selectable>
                    {t('chat.question.after')}
                  </Text>
                  <Text className="font-medium text-sm text-foreground" selectable>
                    {t('chat.question.removed')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </MessagePart.Tool>
  );
}

function SkillManagementPart({
  part,
  output,
}: {
  part: ToolMessagePart;
  output: Record<string, unknown> | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  if (!output) return <GenericToolPart part={part} />;
  const skillId = SkillIdSchema.safeParse(output.skill_id);
  if (output.status === 'installed' && skillId.success) {
    return (
      <MessagePart.Tool
        title={t('skills.candidate.install')}
        state="complete"
        statusText={t('skills.find.installed')}
      >
        <View className="gap-2">
          <Text className="text-sm text-foreground" selectable>
            {typeof output.name === 'string' ? output.name : ''}
          </Text>
          {typeof output.source === 'string' ? (
            <Text className="text-xs text-muted-foreground" selectable>
              {output.source}
            </Text>
          ) : null}
          {output.availableThisTurn === false ? (
            <Text className="text-sm text-muted-foreground">{t('skills.find.nextTurn')}</Text>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/skills/[skillId]',
                params: { skillId: skillId.data },
              })
            }
          >
            {t('skills.find.manage')}
          </Button>
        </View>
      </MessagePart.Tool>
    );
  }
  return <GenericToolPart part={part} />;
}
