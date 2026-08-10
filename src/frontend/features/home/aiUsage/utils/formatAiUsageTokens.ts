const TOKEN_UNITS = [
  { divisor: 1_000_000_000_000, suffix: 'T' },
  { divisor: 1_000_000_000, suffix: 'B' },
  { divisor: 1_000_000, suffix: 'M' },
  { divisor: 1_000, suffix: 'K' },
] as const;

export function createAiUsageTokenFormatter(locale: string): (value: number) => string {
  const integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const scaledFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    useGrouping: false,
  });

  return (value) => {
    const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    const unit = TOKEN_UNITS.find(({ divisor }) => normalizedValue >= divisor);

    if (!unit) {
      return integerFormatter.format(normalizedValue);
    }

    return `${scaledFormatter.format(normalizedValue / unit.divisor)}${unit.suffix}`;
  };
}
