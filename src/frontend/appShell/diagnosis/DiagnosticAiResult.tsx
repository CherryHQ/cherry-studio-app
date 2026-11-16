import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DiagnosticAiReport } from '@/shared/contracts/diagnosticSession';

export function DiagnosticAiResult({ report }: { report: DiagnosticAiReport }) {
  const { t } = useTranslation();

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
          {t('diagnosis.conclusion')}
        </Text>
        <Text className="text-base text-foreground" selectable>
          {report.cause}
        </Text>
      </View>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
          {t('diagnosis.advice')}
        </Text>
        {report.advice.map((advice) => (
          <View key={advice} className="flex-row gap-2">
            <Text accessible={false} className="text-sm text-muted-foreground">
              {'\u2022'}
            </Text>
            <Text className="min-w-0 flex-1 text-sm text-foreground" selectable>
              {advice}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
