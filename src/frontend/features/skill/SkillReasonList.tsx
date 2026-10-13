import { Button } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { skillReasonRoute } from '@/frontend/utils/skillStatus';
import type { SkillAdmissionReason } from '@/shared/data/types/skill';

/** Translated admission reasons with an in-app repair action where one exists. */
export function SkillReasonList({ reasons }: { reasons: readonly SkillAdmissionReason[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  if (reasons.length === 0) return null;
  return (
    <View className="gap-2">
      {reasons.map((reason) => {
        const route = skillReasonRoute(reason.code);
        return (
          <View
            className="flex-row items-center gap-3"
            key={`${reason.code}:${reason.subject ?? ''}`}
          >
            <Text className="min-w-0 flex-1 text-sm text-muted-foreground" selectable>
              {t(`skills.reason.${reason.code}`, { subject: reason.subject ?? '' })}
            </Text>
            {route ? (
              <Button onPress={() => router.push(route as never)} size="xs" variant="secondary">
                {t('skills.fix')}
              </Button>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
