import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DiagnosticAiReport } from '@/shared/contracts/diagnosticSession';

export function DiagnosticAiResult({
  report,
  title,
}: {
  report: DiagnosticAiReport;
  title: string;
}) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View className="gap-6">
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          {title}
        </Text>
        <Text
          className="text-base text-foreground"
          numberOfLines={isExpanded ? undefined : 3}
          selectable
        >
          {report.cause}
        </Text>
        <View className="items-start">
          <Button
            accessibilityState={{ expanded: isExpanded }}
            icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            onPress={() => setIsExpanded(!isExpanded)}
            size="inline"
            testID="diagnosis-analysis-toggle"
            variant="text"
          >
            {t(isExpanded ? 'diagnosis.collapseAnalysis' : 'diagnosis.fullAnalysis')}
          </Button>
        </View>
      </View>
      <View className="gap-4">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {t('diagnosis.advice')}
        </Text>
        {report.advice.map((advice, index) => (
          <View key={advice} className="flex-row items-start gap-3">
            <Text className="text-base font-medium text-muted-foreground">
              {new Intl.NumberFormat(i18n.resolvedLanguage).format(index + 1)}.
            </Text>
            <Text className="flex-1 text-base text-foreground" selectable>
              {advice}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
