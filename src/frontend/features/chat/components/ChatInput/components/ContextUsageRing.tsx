import {
  AnchoredInfoPopover,
  Button,
  Composer,
  type InfoPopoverAnchor,
  useToast,
} from '@cherrystudio/ui/components';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewInstance } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { AgentProtocolError } from '@/shared/contracts/agent';

import { type ContextUsage, formatContextUsagePercent } from '../utils/contextUsage';
import { ContextUsageProgress } from './ContextUsageProgress';

type CompactContext = () => Promise<'compacted' | 'unchanged' | 'unavailable'>;

export function ContextUsageRing({
  usage,
  testID,
  onCompact,
  compactDisabled,
}: {
  usage: ContextUsage;
  testID: string;
  onCompact?: CompactContext;
  compactDisabled?: boolean;
}) {
  const { arcRatio, severity, ratio } = usage;
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const percent =
    ratio === undefined
      ? t('chat.messageUsage.unavailable')
      : formatContextUsagePercent(ratio, language, usage.estimated);
  const targetRef = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<InfoPopoverAnchor>();
  const close = useCallback(() => setAnchor(undefined), []);
  const [track, normal, warning, error] = useThemeColor([
    'muted-foreground',
    'foreground',
    'warning',
    'error',
  ]);
  const circumference = 2 * Math.PI * 7.5;
  const color = severity === 'warning' ? warning : severity === 'error' ? error : normal;
  return (
    <View collapsable={false} ref={targetRef}>
      <Composer.Action
        accessibilityLabel={
          ratio === undefined
            ? t('chat.contextUsage.accessibilityUnavailable')
            : t('chat.contextUsage.accessibilityLabel', { percent })
        }
        className="bg-transparent"
        onPress={() => {
          const target = targetRef.current;
          target?.measureInWindow((pageX, pageY, width, height) => {
            if (targetRef.current === target) setAnchor({ pageX, pageY, width, height });
          });
        }}
        testID={testID}
      >
        <Svg width={18} height={18} viewBox="0 0 20 20">
          <Circle
            cx={10}
            cy={10}
            r={7.5}
            stroke={track}
            strokeWidth={2}
            fill="none"
            opacity={0.28}
          />
          {arcRatio !== undefined ? (
            <Circle
              cx={10}
              cy={10}
              r={7.5}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
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
        footer={
          onCompact ? (
            <ContextCompactionButton
              onCompact={onCompact}
              disabled={compactDisabled}
              onDone={close}
            />
          ) : undefined
        }
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

function ContextCompactionButton({
  onCompact,
  disabled,
  onDone,
}: {
  onCompact: CompactContext;
  disabled?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [compacting, setCompacting] = useState(false);

  async function compact() {
    if (compacting || disabled) return;
    setCompacting(true);
    try {
      const result = await onCompact();
      if (result === 'compacted') {
        onDone();
        toast.show({ label: t('chat.compaction.compacted_plain'), variant: 'success' });
      } else if (result === 'unchanged') {
        toast.show({ label: t('chat.compaction.unchanged') });
      } else {
        toast.show({ label: t('chat.compaction.unavailable'), variant: 'danger' });
      }
    } catch (error) {
      if (error instanceof AgentProtocolError && error.view.code === 'CANCELLED') return;
      if (error instanceof AgentProtocolError && error.view.code === 'SESSION_BUSY') {
        toast.show({ label: t('chat.compaction.unavailable') });
        return;
      }
      toast.show({ label: t('chat.compaction.failed'), variant: 'danger' });
    } finally {
      setCompacting(false);
    }
  }

  return (
    <Button
      disabled={disabled}
      loading={compacting}
      onPress={() => void compact()}
      size="sm"
      testID="chat-compact-context"
      variant="secondary"
    >
      <Button.Label>{t('chat.compaction.action')}</Button.Label>
    </Button>
  );
}
