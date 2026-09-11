import GaugeIcon from '@cherrystudio/app-icons/icons/gauge';
import { Composer } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { EffortSlider } from '../effortSlider';
import {
  type ChatInputReasoningEffort,
  getChatInputReasoningEffortOption,
} from '../utils/chatInputReasoning';

type ChatInputEffortOverlayProps = {
  children: (gauge: ReactNode) => ReactNode;
  modelLabel?: string;
  onChange: (value: ChatInputReasoningEffort) => void;
  onClose: () => void;
  onOpen: () => void;
  open: boolean;
  reasoningEffort: ChatInputReasoningEffort;
  reasoningEfforts: readonly ChatInputReasoningEffort[];
};

/** An anchored control; keyboard geometry belongs to the shared popover. */
export function ChatInputEffortOverlay({
  children,
  modelLabel,
  onChange,
  onClose,
  onOpen,
  open,
  reasoningEffort,
  reasoningEfforts,
}: ChatInputEffortOverlayProps) {
  const { t } = useTranslation();
  const initialFocusRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const options = useMemo(
    () =>
      reasoningEfforts.map((value) => ({
        label: t(getChatInputReasoningEffortOption(value)?.labelKey ?? value),
        value,
      })),
    [reasoningEfforts, t],
  );
  const handleChange = useCallback(
    (value: string) => onChange(value as ChatInputReasoningEffort),
    [onChange],
  );
  const currentLabel = options.find((option) => option.value === reasoningEffort)?.label ?? '';
  const label = `${modelLabel ?? t('chat.model.select')} ${currentLabel}`.trim();

  return (
    <Composer.Popover
      accessibilityLabel={t('chat.reasoning.title')}
      content={
        <ScrollView
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          contentContainerClassName="gap-3 p-3"
        >
          <View ref={initialFocusRef} accessible accessibilityLabel={label}>
            <Text className="font-semibold text-foreground text-sm">{label}</Text>
          </View>
          <EffortSlider
            accessibilityLabel={t('chat.reasoning.title')}
            onChange={handleChange}
            options={options}
            testID="chat-input-effort-slider-control"
            value={reasoningEffort}
          />
        </ScrollView>
      }
      initialFocusRef={initialFocusRef}
      maxWidth={320}
      onClose={onClose}
      open={open}
      returnFocusRef={triggerRef}
      testID="chat-input-effort-slider"
    >
      {children(
        options.length > 0 ? (
          <View ref={triggerRef} collapsable={false}>
            <Composer.Action
              accessibilityLabel={`${t('chat.reasoning.title')}: ${currentLabel}`}
              onPress={open ? onClose : onOpen}
              testID="chat-input-effort-gauge"
            >
              <GaugeIcon className="size-3.5 text-foreground" />
            </Composer.Action>
          </View>
        ) : null,
      )}
    </Composer.Popover>
  );
}
