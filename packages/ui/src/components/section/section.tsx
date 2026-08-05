import { cn } from 'heroui-native/utils';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { SectionItemProps, SectionProps } from './section.types';

function renderTextSlot(content: ReactNode, className?: string) {
  return typeof content === 'string' || typeof content === 'number' ? (
    <Text className={className}>{content}</Text>
  ) : (
    content
  );
}

function SectionItem({
  accessibilityHint,
  accessibilityLabel,
  className,
  description,
  destructive = false,
  disabled = false,
  label,
  leading,
  onPress,
  showChevron,
  style,
  testID,
  trailing,
}: SectionItemProps) {
  const shouldShowChevron = showChevron ?? (Boolean(onPress) && trailing == null);
  const resolvedAccessibilityLabel =
    accessibilityLabel ?? (typeof label === 'string' ? label : undefined);
  const rowClassName = cn(
    'min-h-10 flex-row items-center gap-3 px-3 py-2',
    disabled && 'opacity-40',
    className,
  );
  const content = (
    <>
      {leading ? <View className="shrink-0 items-center justify-center">{leading}</View> : null}
      <View className="min-w-0 flex-1 gap-1">
        {renderTextSlot(label, cn('text-base', destructive ? 'text-danger' : 'text-foreground'))}
        {description ? renderTextSlot(description, 'text-sm text-muted-foreground') : null}
      </View>
      {trailing ? <View className="shrink-0 items-center justify-center">{trailing}</View> : null}
      {shouldShowChevron ? (
        <View className="shrink-0" testID="section-chevron">
          <ChevronRightIcon className="size-5 text-muted-foreground" strokeWidth={2} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={resolvedAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={cn(rowClassName, 'active:bg-foreground/5')}
        disabled={disabled}
        onPress={onPress}
        style={style}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityHint={accessibilityHint}
      accessibilityLabel={resolvedAccessibilityLabel}
      className={rowClassName}
      style={style}
      testID={testID}
    >
      {content}
    </View>
  );
}

function SectionRoot({
  children,
  className,
  contentClassName,
  footer,
  title,
  ...viewProps
}: SectionProps) {
  const rows = Children.toArray(children);
  const hasLeading = rows.some(
    (row) =>
      isValidElement<SectionItemProps>(row) &&
      row.type === SectionItem &&
      Boolean(row.props.leading),
  );

  return (
    <View className={cn('gap-3', className)} {...viewProps}>
      {title ? renderTextSlot(title, 'px-3 text-base font-semibold text-muted-foreground') : null}
      <View
        className={cn('overflow-hidden rounded-2xl bg-settings-grouped-surface', contentClassName)}
        style={{ borderCurve: 'continuous' }}
      >
        {rows.map((row, index) => {
          const key = isValidElement(row) && row.key != null ? row.key : index;

          return (
            <Fragment key={key}>
              {index > 0 ? (
                <View
                  className={cn(hasLeading ? 'ml-11 mr-3' : 'mx-3', 'h-px bg-border')}
                  testID="section-separator"
                />
              ) : null}
              {row}
            </Fragment>
          );
        })}
      </View>
      {footer ? renderTextSlot(footer, 'px-3 text-sm text-muted-foreground') : null}
    </View>
  );
}

SectionRoot.displayName = 'Section';
SectionItem.displayName = 'Section.Item';

export const Section = Object.assign(SectionRoot, {
  Item: SectionItem,
});
