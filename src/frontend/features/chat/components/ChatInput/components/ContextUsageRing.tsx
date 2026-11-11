import { AnchoredInfoPopover, Composer, type InfoPopoverAnchor } from '@cherrystudio/ui/components';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewInstance } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { type ContextUsage, formatContextUsagePercent } from '../utils/contextUsage';
import { ContextUsageProgress } from './ContextUsageProgress';

export function ContextUsageRing({ usage, testID }: { usage: ContextUsage; testID: string }) {
  const { arcRatio, severity, ratio } = usage;
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const percent =
    ratio === undefined
      ? t('chat.messageUsage.unavailable')
      : formatContextUsagePercent(ratio, language);
  const targetRef = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<InfoPopoverAnchor>();
  const close = useCallback(() => setAnchor(undefined), []);
  const [track, primary, warning, error] = useThemeColor([
    'muted-foreground',
    'primary',
    'warning',
    'error',
  ]);
  const circumference = 2 * Math.PI * 8;
  const color = severity === 'warning' ? warning : severity === 'error' ? error : primary;
  return (
    <View collapsable={false} ref={targetRef}>
      <Composer.Action
        accessibilityLabel={
          ratio === undefined
            ? t('chat.contextUsage.accessibilityUnavailable')
            : t('chat.contextUsage.accessibilityLabel', { percent })
        }
        onPress={() => {
          const target = targetRef.current;
          target?.measureInWindow((pageX, pageY, width, height) => {
            if (targetRef.current === target) setAnchor({ pageX, pageY, width, height });
          });
        }}
        testID={testID}
      >
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={10} cy={10} r={8} stroke={track} strokeWidth={2} fill="none" opacity={0.3} />
          {arcRatio !== undefined ? (
            <Circle
              cx={10}
              cy={10}
              r={8}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - arcRatio)}
              rotation={-90}
              origin="10, 10"
            />
          ) : null}
        </Svg>
      </Composer.Action>
      <AnchoredInfoPopover
        anchor={anchor}
        onClose={close}
        placement="above"
        text={t('chat.contextUsage.summary', {
          percent,
          capacity: new Intl.NumberFormat(language).format(usage.capacity),
        })}
        testID="chat-context-usage-popover"
        width={272}
      >
        <ContextUsageProgress usage={usage} />
      </AnchoredInfoPopover>
    </View>
  );
}
