import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DiagnosticAiReport } from '@/shared/contracts/diagnosticSession';

export function DiagnosticAiResult({ report }: { report: DiagnosticAiReport }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-xs text-muted-foreground">
          {t('diagnosis.conclusion')}
        </Text>
        <Text
          className="text-sm text-foreground"
          numberOfLines={isExpanded ? undefined : 3}
          selectable
        >
          {report.cause}
        </Text>
        <View className="items-start">
          <Button
            accessibilityState={{ expanded: isExpanded }}
            hitSlop={8}
            onPress={() => setIsExpanded(!isExpanded)}
            size="inline"
            testID="diagnosis-analysis-toggle"
            variant="text"
          >
            {t(isExpanded ? 'diagnosis.collapseAnalysis' : 'diagnosis.fullAnalysis')}
          </Button>
        </View>
      </View>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-xs font-medium text-foreground">
          {t('diagnosis.advice')}
        </Text>
        <Text className="text-sm text-foreground" selectable>
          {report.advice[0]}
        </Text>
      </View>
    </View>
  );
}
