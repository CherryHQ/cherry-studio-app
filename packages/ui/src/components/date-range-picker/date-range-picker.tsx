import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import dayjs from 'dayjs';
import { useWindowDimensions, View } from 'react-native';
import Calendar, { type DateType } from 'react-native-ui-datepicker';
import { useResolveClassNames } from 'uniwind';

export type DateRangeValue = { startDate?: Date; endDate?: Date };

export type DateRangePickerProps = {
  locale: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onValueChange: (value: DateRangeValue) => void;
  testID?: string;
  value: DateRangeValue;
};

function fromCalendarDate(value: DateType): Date | undefined {
  if (value == null) return undefined;
  const date = dayjs(value).toDate();
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** A controlled range calendar; callers own draft, confirmation, and date-boundary semantics. */
export function DateRangePicker({
  locale,
  maximumDate,
  minimumDate,
  onValueChange,
  testID,
  value,
}: DateRangePickerProps) {
  const { fontScale } = useWindowDimensions();
  const text = useResolveClassNames('text-sm text-foreground');
  const mutedText = useResolveClassNames('text-xs text-muted-foreground');
  const heading = useResolveClassNames('font-medium text-base text-foreground');
  const day = useResolveClassNames('rounded-full');
  const selected = useResolveClassNames('rounded-full bg-foreground');
  const selectedText = useResolveClassNames('text-background');
  const range = useResolveClassNames('bg-secondary');
  const middle = useResolveClassNames('rounded-none bg-transparent');
  const disabled = useResolveClassNames('text-muted-foreground opacity-40');
  const navigation = useResolveClassNames('min-h-11 min-w-11 items-center justify-center');
  const cellHeight = Math.max(44, Number(text.lineHeight ?? 20) * fontScale + 16);
  const weekdaysHeight = Math.max(32, Number(mutedText.lineHeight ?? 18) * fontScale + 8);
  // The caller supplies the resolved language; this only adapts the vendor's locale identifiers.
  const language = locale.toLowerCase();
  const calendarLocale =
    language === 'zh-cn' || language === 'zh-tw' ? language : language.split('-')[0];

  return (
    <View testID={testID}>
      <Calendar
        allowRangeReset
        mode="range"
        locale={calendarLocale}
        // Exchange calendar days in UTC, then reconstruct local dates at the public boundary.
        timeZone="UTC"
        firstDayOfWeek={1}
        startDate={value.startDate ? dayjs(value.startDate).format('YYYY-MM-DD') : undefined}
        endDate={value.endDate ? dayjs(value.endDate).format('YYYY-MM-DD') : undefined}
        minDate={minimumDate ? dayjs(minimumDate).format('YYYY-MM-DD') : undefined}
        maxDate={maximumDate ? dayjs(maximumDate).format('YYYY-MM-DD') : undefined}
        onChange={({ startDate, endDate }) => {
          // The vendor clears a pending start on a repeated tap; a range picker completes that day.
          if (startDate == null && endDate == null && value.startDate && !value.endDate) {
            onValueChange({ startDate: value.startDate, endDate: value.startDate });
            return;
          }
          onValueChange({
            startDate: fromCalendarDate(startDate),
            endDate: fromCalendarDate(endDate),
          });
        }}
        containerHeight={cellHeight * 6 + weekdaysHeight}
        weekdaysHeight={weekdaysHeight}
        styles={{
          day,
          day_label: text,
          weekday_label: mutedText,
          month_label: text,
          year_label: text,
          month_selector_label: heading,
          year_selector_label: heading,
          button_prev: navigation,
          button_next: navigation,
          range_fill: range,
          range_start: selected,
          range_end: selected,
          range_middle: middle,
          range_start_label: selectedText,
          range_end_label: selectedText,
          range_middle_label: text,
          selected,
          selected_label: selectedText,
          selected_month: selected,
          selected_month_label: selectedText,
          selected_year: selected,
          selected_year_label: selectedText,
          active_year: range,
          active_year_label: text,
          disabled_label: disabled,
        }}
        components={{
          IconPrev: <ChevronLeftIcon className="size-5 text-foreground" />,
          IconNext: <ChevronRightIcon className="size-5 text-foreground" />,
        }}
      />
    </View>
  );
}
