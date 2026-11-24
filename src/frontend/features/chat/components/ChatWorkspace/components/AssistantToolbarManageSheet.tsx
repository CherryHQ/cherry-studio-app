import AtSignIcon from '@cherrystudio/app-icons/icons/at-sign';
import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import LockIcon from '@cherrystudio/app-icons/icons/lock';
import MinusIcon from '@cherrystudio/app-icons/icons/minus';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import ShareIcon from '@cherrystudio/app-icons/icons/share';
import SplitIcon from '@cherrystudio/app-icons/icons/split';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import Volume2Icon from '@cherrystudio/app-icons/icons/volume-2';
import {
  BottomSheet,
  Button,
  ScrollInteractionBoundary,
  Section,
  Sortable,
  useSortableScrollController,
} from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ScrollView, type ScrollViewInstance, Text, View } from 'react-native';

import {
  ASSISTANT_TOOLBAR_MAX_PINNED,
  type AssistantMessageActionId,
  type AssistantMessageToolbarConfig,
  isLockedOverflowAction,
  pinAssistantToolbarAction,
  reorderAssistantToolbarZone,
  unpinAssistantToolbarAction,
} from '@/shared/data/types/assistantMessageToolbar';

const ACTION_PRESENTATION = {
  copy: { Icon: CopyIcon, label: 'common.copy' },
  readAloud: { Icon: Volume2Icon, label: 'voice.speech.start' },
  retry: { Icon: RotateCcwIcon, label: 'chat.messageActions.regenerate' },
  answerWith: { Icon: AtSignIcon, label: 'chat.messageActions.answerWith' },
  fork: { Icon: SplitIcon, label: 'chat.messageActions.manageForkLabel' },
  edit: { Icon: PencilIcon, label: 'chat.messageActions.editAnswerAction' },
  translate: { Icon: LanguagesIcon, label: 'chat.translation.translate' },
  share: { Icon: ShareIcon, label: 'chat.messageActions.share' },
  delete: { Icon: Trash2Icon, label: 'common.delete' },
} as const;

type AssistantToolbarManageSheetProps = {
  config: AssistantMessageToolbarConfig;
  onChange: (config: AssistantMessageToolbarConfig) => void;
  onClose: () => void;
  onClosed?: () => void;
  open: boolean;
};

export function AssistantToolbarManageSheet({
  config,
  onChange,
  onClose,
  onClosed,
  open,
}: AssistantToolbarManageSheetProps) {
  const { t, i18n } = useTranslation();
  const scroll = useSortableScrollController<ScrollViewInstance>();
  const movableOverflowIds = config.overflow.filter((id) => !isLockedOverflowAction(id));
  const isPinnedFull = config.pinned.length >= ASSISTANT_TOOLBAR_MAX_PINNED;
  const counter = `${config.pinned.length}/${ASSISTANT_TOOLBAR_MAX_PINNED}`;
  const locale = i18n?.resolvedLanguage ?? i18n?.language;
  const previewDuration = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    maximumFractionDigits: 1,
  }).format(2.1);

  return (
    <BottomSheet
      onClose={onClose}
      onClosed={onClosed}
      open={open}
      size="large"
      testID="assistant-toolbar-manage-sheet"
      title={t('chat.messageActions.manageTitle')}
    >
      <Sortable.Root scrollController={scroll.controller}>
        {({ isDragging }) => (
          <ScrollInteractionBoundary>
            {(scrollHandlers) => (
              <ScrollView
                ref={scroll.setRef}
                onScroll={scroll.onScroll}
                scrollEventThrottle={16}
                {...scrollHandlers}
                scrollEnabled={!isDragging}
                showsVerticalScrollIndicator={false}
                contentContainerClassName="gap-5 px-4 pt-1 pb-6"
              >
                <Sortable.Chrome>
                  <View className="gap-2.5 rounded-2xl border border-border-subtle bg-card p-3.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm text-muted-foreground">
                        {t('chat.messageActions.managePreview')}
                      </Text>
                      <Text className="text-sm text-muted-foreground tabular-nums">{counter}</Text>
                    </View>
                    <View className="gap-2 py-1">
                      <View className="h-2 w-4/5 rounded-full bg-secondary" />
                      <View className="h-2 w-1/2 rounded-full bg-secondary" />
                    </View>
                    <View className="min-h-7 flex-row items-center gap-1">
                      {config.pinned.length ? (
                        config.pinned.map((id) => {
                          const { Icon } = ACTION_PRESENTATION[id];
                          return (
                            <View
                              className="p-1.5"
                              key={id}
                              testID={`toolbar-manage-preview-${id}`}
                            >
                              <Icon className="text-muted-foreground" size={15} />
                            </View>
                          );
                        })
                      ) : (
                        <Text className="shrink text-xs text-muted-foreground">
                          {t('chat.messageActions.managePinnedEmptyHint')}
                        </Text>
                      )}
                      <View className="p-1.5">
                        <EllipsisIcon className="text-muted-foreground" size={15} />
                      </View>
                      <Text className="flex-1 text-right text-xs text-foreground-tertiary tabular-nums">
                        1.2k · {previewDuration}
                      </Text>
                    </View>
                  </View>
                </Sortable.Chrome>
                <View className="gap-2">
                  <Sortable.Chrome>
                    <View className="min-h-8 flex-row items-center justify-between px-3">
                      <Text className="text-sm font-medium text-muted-foreground">
                        {t('chat.messageActions.managePinnedSection')}
                      </Text>
                      <Text className="text-sm text-muted-foreground tabular-nums">{counter}</Text>
                    </View>
                  </Sortable.Chrome>
                  <Sortable.Group
                    estimatedItemHeight={52}
                    groupId="pinned"
                    itemIds={config.pinned}
                    onReorder={({ fromIndex, toIndex }) =>
                      onChange(reorderAssistantToolbarZone(config, 'pinned', fromIndex, toIndex))
                    }
                  >
                    <Section>
                      {config.pinned.length === 0 ? (
                        <Section.Item label={t('chat.messageActions.managePinnedEmpty')} />
                      ) : (
                        config.pinned.map((id, index) =>
                          renderManageRow({
                            config,
                            groupSize: config.pinned.length,
                            id,
                            index,
                            onChange,
                            t,
                            zone: 'pinned',
                          }),
                        )
                      )}
                    </Section>
                  </Sortable.Group>
                </View>
                <View className="gap-2">
                  <Sortable.Chrome>
                    <View className="min-h-8 flex-row items-center justify-between px-3">
                      <Text className="text-sm font-medium text-muted-foreground">
                        {t('chat.messageActions.manageOverflowSection')}
                      </Text>
                    </View>
                  </Sortable.Chrome>
                  <Sortable.Group
                    estimatedItemHeight={52}
                    groupId="overflow"
                    itemIds={movableOverflowIds}
                    onReorder={({ fromIndex, toIndex }) =>
                      onChange(reorderAssistantToolbarZone(config, 'overflow', fromIndex, toIndex))
                    }
                  >
                    <Section
                      footer={
                        isPinnedFull
                          ? t('chat.messageActions.managePinnedLimitHint', {
                              max: ASSISTANT_TOOLBAR_MAX_PINNED,
                            })
                          : undefined
                      }
                    >
                      {movableOverflowIds.map((id, index) =>
                        renderManageRow({
                          config,
                          groupSize: movableOverflowIds.length,
                          id,
                          index,
                          onChange,
                          t,
                          zone: 'overflow',
                        }),
                      )}
                      <Section.Item
                        destructive
                        description={t('chat.messageActions.manageDeleteLocked')}
                        label={t('common.delete')}
                        leading={
                          <View className="flex-row items-center gap-2.5">
                            <View className="size-7 items-center justify-center">
                              <LockIcon className="text-foreground-tertiary" size={14} />
                            </View>
                            <Trash2Icon className="text-destructive" size={16} />
                          </View>
                        }
                        testID="toolbar-manage-locked-delete"
                      />
                    </Section>
                  </Sortable.Group>
                </View>
              </ScrollView>
            )}
          </ScrollInteractionBoundary>
        )}
      </Sortable.Root>
    </BottomSheet>
  );
}

function renderManageRow({
  config,
  groupSize,
  id,
  index,
  onChange,
  t,
  zone,
}: Pick<AssistantToolbarManageSheetProps, 'config' | 'onChange'> & {
  groupSize: number;
  id: AssistantMessageActionId;
  index: number;
  t: TFunction;
  zone: 'pinned' | 'overflow';
}) {
  const { Icon, label } = ACTION_PRESENTATION[id];
  const actionLabel = t(label);
  const isPinned = zone === 'pinned';
  const isPinnedFull = config.pinned.length >= ASSISTANT_TOOLBAR_MAX_PINNED;
  const moveAction = {
    id: isPinned ? 'unpin' : 'pin',
    label: t(
      isPinned ? 'chat.messageActions.manageMoveToMore' : 'chat.messageActions.managePinAction',
    ),
    onPress: () =>
      onChange(
        isPinned ? unpinAssistantToolbarAction(config, id) : pinAssistantToolbarAction(config, id),
      ),
  };

  return (
    <Sortable.Item
      accessibilityLabels={{
        moveDown: t('common.moveDown', { name: actionLabel }),
        moveToTop: t('common.moveToTop'),
        moveUp: t('common.moveUp', { name: actionLabel }),
      }}
      estimatedHeight={52}
      groupId={zone}
      groupSize={groupSize}
      id={id}
      index={index}
      key={id}
      menuItems={[
        ...(index > 0
          ? [
              {
                id: 'move-to-top',
                label: t('common.moveToTop'),
                onPress: () => onChange(reorderAssistantToolbarZone(config, zone, index, 0)),
              },
            ]
          : []),
        ...(isPinned || !isPinnedFull ? [moveAction] : []),
      ]}
      movable={groupSize > 1}
    >
      <Section.Item
        label={
          isPinned ? (
            actionLabel
          ) : (
            <Text className="text-base text-muted-foreground">{actionLabel}</Text>
          )
        }
        leading={
          <View className="flex-row items-center gap-2.5">
            <Sortable.Exclusion>
              <Button
                accessibilityLabel={t(
                  isPinned
                    ? 'chat.messageActions.manageRemoveAccessibility'
                    : 'chat.messageActions.manageAddAccessibility',
                  { name: actionLabel },
                )}
                disabled={!isPinned && isPinnedFull}
                haptic="selection"
                icon={
                  isPinned ? (
                    <MinusIcon className="text-muted-foreground" size={14} />
                  ) : (
                    <PlusIcon className="text-primary" size={14} />
                  )
                }
                onPress={moveAction.onPress}
                shape="pill"
                size="xs"
                testID={`toolbar-manage-${isPinned ? 'unpin' : 'pin'}-${id}`}
                variant="tonal"
              />
            </Sortable.Exclusion>
            <Icon className={isPinned ? 'text-foreground' : 'text-muted-foreground'} size={16} />
          </View>
        }
      />
    </Sortable.Item>
  );
}
