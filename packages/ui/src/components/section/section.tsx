import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
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
import { SwitchIndicator } from '../switch/switch-indicator';
import type {
  SectionHeaderProps,
  SectionItemDensity,
  SectionItemProps,
  SectionProps,
  SectionRadioItemProps,
  SectionSelectItemProps,
  SectionSwitchItemProps,
} from './section.types';

type InternalSectionItemProps = SectionItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

type InternalSectionRadioItemProps = SectionRadioItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

type InternalSectionSelectItemProps = SectionSelectItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

type InternalSectionSwitchItemProps = SectionSwitchItemProps & {
  onPressedChange?: (isPressed: boolean) => void;
};

function renderTextSlot(content: ReactNode, className?: string) {
  return typeof content === 'string' || typeof content === 'number' ? (
    <Text className={className}>{content}</Text>
  ) : (
    content
  );
}

function SectionHeader({ children, title, ...viewProps }: SectionHeaderProps) {
  return (
    <View className="min-h-10 flex-row items-center gap-3" {...viewProps}>
      <View className="min-w-0 flex-1">
        {renderTextSlot(title, 'text-base font-semibold text-foreground')}
      </View>
      {children !== undefined ? (
        <View className="shrink-0 items-center justify-center">{children}</View>
      ) : null}
    </View>
  );
}

const itemDensityStyles: Record<SectionItemDensity, string> = {
  compact: 'py-2',
  comfortable: 'py-4',
  default: 'py-3',
};

function SectionItem({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  children,
  density = 'default',
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
    'min-h-10 flex-row items-center gap-3 px-4',
    itemDensityStyles[density],
    disabled && 'opacity-40',
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

function SectionSelectItem({
  onPressedChange,
  value,
  valueLeading,
  ...props
}: InternalSectionSelectItemProps) {
  return (
    <SectionItem
      {...props}
      onPressedChange={onPressedChange}
      showChevron={false}
      trailing={
        <View className="min-w-0 flex-row items-center justify-end gap-1">
          {valueLeading ? (
            <View className="shrink-0 items-center justify-center">{valueLeading}</View>
          ) : null}
          {renderTextSlot(value, 'min-w-0 shrink text-right text-base text-foreground')}
          <ChevronDownIcon
            className="size-5 shrink-0 text-muted-foreground"
            testID="section-select-chevron"
          />
        </View>
      }
    />
  );
}

function SectionSwitchItem({
  disabled = false,
  onPressedChange,
  onValueChange,
  value,
  ...props
}: InternalSectionSwitchItemProps) {
  return (
    <SectionItem
      {...props}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      onPressedChange={onPressedChange}
      showChevron={false}
      trailing={<SwitchIndicator disabled={disabled} value={value} />}
    />
  );
}

function isSectionItemElement(
  child: ReactNode,
): child is ReactElement<
  | InternalSectionItemProps
  | InternalSectionRadioItemProps
  | InternalSectionSelectItemProps
  | InternalSectionSwitchItemProps
> {
  return (
    isValidElement<
      | InternalSectionItemProps
      | InternalSectionRadioItemProps
      | InternalSectionSelectItemProps
      | InternalSectionSwitchItemProps
    >(child) &&
    (child.type === SectionItem ||
      child.type === SectionRadioItem ||
      child.type === SectionSelectItem ||
      child.type === SectionSwitchItem)
  );
}

function SectionRoot({
  children,
  className,
  contentClassName,
  footer,
  title,
  variant = 'grouped',
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
      {title !== undefined || headers.length > 0 ? (
        <View className="px-3">
          {title !== undefined ? <SectionHeader title={title} /> : headers}
        </View>
      ) : null}
      <View
        className={cn(
          variant === 'grouped' ? 'overflow-hidden rounded-2xl bg-card' : 'bg-transparent',
          contentClassName,
        )}
        style={{ borderCurve: 'continuous' }}
      >
        {rows.map((row, index) => {
          const key = isValidElement(row) && row.key != null ? row.key : index;

          return (
            <Fragment key={key}>
              {variant === 'grouped' && index > 0 ? (
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
      {footer
        ? renderTextSlot(
            footer,
            cn('mt-2 text-sm text-muted-foreground', variant === 'grouped' ? 'px-3' : 'px-4'),
          )
        : null}
    </View>
  );
}

SectionRoot.displayName = 'Section';
SectionHeader.displayName = 'Section.Header';
SectionItem.displayName = 'Section.Item';
SectionRadioItem.displayName = 'Section.RadioItem';
SectionSelectItem.displayName = 'Section.SelectItem';
SectionSwitchItem.displayName = 'Section.SwitchItem';

export const Section = Object.assign(SectionRoot, {
  Header: SectionHeader,
  Item: SectionItem,
  RadioItem: SectionRadioItem,
  SelectItem: SectionSelectItem,
  SwitchItem: SectionSwitchItem,
});
