import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useState,
} from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '../../utils';
import type {
  SectionHeaderProps,
  SectionItemProps,
  SectionProps,
  SectionRadioItemProps,
} from './section.types';

type InternalSectionItemProps = SectionItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

type InternalSectionRadioItemProps = SectionRadioItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

function renderTextSlot(content: ReactNode, className?: string) {
  return typeof content === 'string' || typeof content === 'number' ? (
    <Text className={className}>{content}</Text>
  ) : (
    content
  );
}

function SectionHeader({
  children,
  className,
  title,
  titleClassName,
  ...viewProps
}: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-center gap-3 px-3', className)} {...viewProps}>
      <View className="min-w-0 flex-1">
        {renderTextSlot(title, cn('text-base font-semibold text-foreground', titleClassName))}
      </View>
      {children !== undefined ? (
        <View className="shrink-0 items-center justify-center">{children}</View>
      ) : null}
    </View>
  );
}

function SectionItem({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  children,
  className,
  description,
  destructive = false,
  disabled = false,
  label,
  leading,
  onPress,
  onPressIn,
  onPressOut,
  onPressedChange,
  showChevron,
  style,
  testID,
  trailing,
}: InternalSectionItemProps) {
  const shouldShowChevron = showChevron ?? (Boolean(onPress) && trailing == null);
  const resolvedAccessibilityLabel =
    accessibilityLabel ?? (typeof label === 'string' ? label : undefined);
  const resolvedAccessibilityState = {
    ...accessibilityState,
    disabled: disabled || accessibilityState?.disabled,
  };
  const rowClassName = cn(
    'min-h-10 flex-row items-center gap-3 px-4 py-3',
    disabled && 'opacity-40',
    className,
  );
  const content =
    children !== undefined ? (
      <View className="min-w-0 flex-1">{children}</View>
    ) : (
      <>
        {leading ? <View className="shrink-0 items-center justify-center">{leading}</View> : null}
        <View className="min-w-0 flex-1 gap-1">
          {renderTextSlot(
            label,
            cn('text-base', destructive ? 'text-destructive' : 'text-foreground'),
          )}
          {description ? renderTextSlot(description, 'text-sm text-muted-foreground') : null}
        </View>
        {/* Shrinkable and capped, because a trailing value is often a
            variable-length string (a model id, a language name). The label side
            is `flex-1` off a zero basis, so it claims no width of its own and a
            long value would otherwise take the whole row, squeezing the label
            into a column of one character per line. Past this share of the row
            the value is the one that gives. Pair a text value with
            `numberOfLines` to get an ellipsis rather than a wrap. */}
        {trailing ? (
          <View className="min-w-0 max-w-[62%] shrink items-center justify-center">{trailing}</View>
        ) : null}
        {shouldShowChevron ? (
          <View className="shrink-0" testID="section-chevron">
            <ChevronRightIcon className="size-5 text-muted-foreground" />
          </View>
        ) : null}
      </>
    );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={resolvedAccessibilityLabel}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityState={resolvedAccessibilityState}
        className={cn(rowClassName, 'active:bg-foreground/5')}
        disabled={disabled}
        onPress={onPress}
        onPressIn={(event) => {
          onPressedChange?.(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          onPressedChange?.(false);
          onPressOut?.(event);
        }}
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
      accessibilityRole={accessibilityRole}
      accessibilityState={resolvedAccessibilityState}
      className={rowClassName}
      style={style}
      testID={testID}
    >
      {content}
    </View>
  );
}

function SectionRadioItem({ onPressedChange, selected, ...props }: InternalSectionRadioItemProps) {
  return (
    <SectionItem
      {...props}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPressedChange={onPressedChange}
      showChevron={false}
      trailing={selected ? <CheckIcon className="size-5 text-foreground" /> : undefined}
    />
  );
}

function isSectionItemElement(
  child: ReactNode,
): child is ReactElement<InternalSectionItemProps | InternalSectionRadioItemProps> {
  return (
    isValidElement<InternalSectionItemProps | InternalSectionRadioItemProps>(child) &&
    (child.type === SectionItem || child.type === SectionRadioItem)
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
  const childNodes = Children.toArray(children);
  const headers = childNodes.filter(
    (child) => isValidElement<SectionHeaderProps>(child) && child.type === SectionHeader,
  );
  const rows = childNodes.filter(
    (child) => !(isValidElement<SectionHeaderProps>(child) && child.type === SectionHeader),
  );
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const hasLeading = rows.some((row) => isSectionItemElement(row) && Boolean(row.props.leading));

  return (
    <View className={cn('gap-1', className)} {...viewProps}>
      {title !== undefined ? <SectionHeader title={title} /> : headers}
      <View
        className={cn('overflow-hidden rounded-2xl bg-grouped-surface', contentClassName)}
        style={{ borderCurve: 'continuous' }}
      >
        {rows.map((row, index) => {
          const key = isValidElement(row) && row.key != null ? row.key : index;

          return (
            <Fragment key={key}>
              {index > 0 ? (
                <View
                  className={cn(
                    hasLeading ? 'ml-11 mr-3' : 'mx-3',
                    'h-px bg-border',
                    (pressedIndex === index || pressedIndex === index - 1) && 'opacity-0',
                  )}
                  testID="section-separator"
                />
              ) : null}
              {isSectionItemElement(row)
                ? cloneElement(row, {
                    onPressedChange: (isPressed: boolean) =>
                      setPressedIndex((currentIndex) =>
                        isPressed ? index : currentIndex === index ? null : currentIndex,
                      ),
                  })
                : row}
            </Fragment>
          );
        })}
      </View>
      {footer ? renderTextSlot(footer, 'mt-2 px-3 text-sm text-muted-foreground') : null}
    </View>
  );
}

SectionRoot.displayName = 'Section';
SectionHeader.displayName = 'Section.Header';
SectionItem.displayName = 'Section.Item';
SectionRadioItem.displayName = 'Section.RadioItem';

export const Section = Object.assign(SectionRoot, {
  Header: SectionHeader,
  Item: SectionItem,
  RadioItem: SectionRadioItem,
});
