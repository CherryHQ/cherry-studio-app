import { Button, MessagePart } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  SkillActivationSchema,
  SkillIdSchema,
  SkillAdmissionStatusSchema,
} from '@/shared/data/types/skill';

import { GenericToolPart } from './GenericToolPart';
import { getToolName, isRecord, type ToolMessagePart } from './toolPartState';

/** A load receipt is activity; its instruction body is not a completed user task. */
export function SkillToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const output = part.state === 'output-available' && isRecord(part.output) ? part.output : null;
  if (getToolName(part) !== 'load_skill')
    return <SkillManagementPart part={part} output={output} />;
  const activation = SkillActivationSchema.safeParse(
    output?.status === 'ok' ? output.activation : null,
  );
  if (!activation.success) return <GenericToolPart part={part} />;
  return (
    <MessagePart.Tool
      title={t('skills.activity.load')}
      state="complete"
      statusText={t('skills.activity.loaded')}
      testID="skill-load-receipt"
    >
      <Text className="text-sm text-muted-foreground" selectable>
        {activation.data.name} · {activation.data.packageDigest.slice(0, 12)}
      </Text>
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
    const source = isRecord(output.source) ? output.source : null;
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
          <Text className="text-xs text-muted-foreground">
            {output.assessmentProvenance === 'reviewed'
              ? t('skills.provenance.reviewed')
              : t('skills.provenance.ai-assessed')}
          </Text>
          {typeof source?.url === 'string' ? (
            <Text className="text-xs text-muted-foreground" selectable>
              {source.url}
            </Text>
          ) : null}
          {typeof output.adaptation === 'string' ? (
            <Text className="text-sm text-muted-foreground" selectable>
              {t('skills.find.adapted')} · {output.adaptation}
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
                pathname: '/plugins/skills/[skillId]',
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
  const status = SkillAdmissionStatusSchema.safeParse(output.status);
  if (getToolName(part) === 'prepare_skill' && status.success) {
    return (
      <MessagePart.Tool
        title={t('skills.find.prepare')}
        state="complete"
        statusText={t(`skills.status.${status.data}`)}
      >
        <View className="gap-2">
          {typeof output.assessment === 'string' ? (
            <Text className="text-sm text-foreground" selectable>
              {output.assessment}
            </Text>
          ) : null}
          {typeof output.adaptation === 'string' ? (
            <Text className="text-sm text-muted-foreground" selectable>
              {t('skills.find.adapted')} · {output.adaptation}
            </Text>
          ) : null}
          <Text className="text-xs text-muted-foreground">{t('skills.ai.assessmentHint')}</Text>
        </View>
      </MessagePart.Tool>
    );
  }
  return <GenericToolPart part={part} />;
}
