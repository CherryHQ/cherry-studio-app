import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { SkillAssessment, SkillProfile } from '@/shared/data/types/skill';

/** Assessment output is attributed model content, not a localized application verdict. */
export function SkillAssessmentDetails({
  assessment,
  adaptation,
}: {
  assessment: SkillAssessment;
  adaptation?: SkillProfile['adaptation'];
}) {
  const { t } = useTranslation();
  return (
    <Section title={t('skills.ai.assessmentTitle')}>
      <Section.Item>
        <View className="gap-3">
          <Text selectable className="text-sm text-foreground">
            {assessment.summary}
          </Text>
          <Text selectable className="text-xs text-muted-foreground">
            {t('skills.ai.model', { model: assessment.modelId })}
          </Text>
          <Text className="text-xs text-muted-foreground">{t('skills.ai.assessmentHint')}</Text>
          {adaptation ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                {t('skills.find.adapted')}
              </Text>
              <Text className="text-sm text-foreground" selectable>
                {adaptation.summary}
              </Text>
              <Text className="text-xs text-muted-foreground" selectable>
                {adaptation.upstreamDigest}
              </Text>
              {adaptation.changes.map((change) => (
                <View className="gap-1" key={JSON.stringify(change)}>
                  <Text className="text-xs text-muted-foreground" selectable>
                    {change.path} · {change.reason}
                  </Text>
                  <Text className="text-sm text-muted-foreground" selectable>
                    {change.before}
                  </Text>
                  <Text className="text-sm text-foreground" selectable>
                    {change.after}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {assessment.uncertainties.map((item) => (
            <Text key={item} selectable className="text-sm text-muted-foreground">
              {item}
            </Text>
          ))}
          {assessment.evidence.map((item) => (
            <View key={JSON.stringify(item)} className="gap-1">
              <Text selectable className="text-xs text-muted-foreground">
                {item.path}
              </Text>
              <Text selectable className="text-sm text-foreground">
                {item.quote}
              </Text>
              <Text selectable className="text-sm text-muted-foreground">
                {item.explanation}
              </Text>
            </View>
          ))}
        </View>
      </Section.Item>
    </Section>
  );
}
