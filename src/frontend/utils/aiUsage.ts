export function formatAiUsageCost(
  amount: number,
  currency: string,
  locale: string,
  currencyDisplay: 'symbol' | 'code' | 'narrowSymbol' = 'symbol',
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay,
    maximumFractionDigits: 4,
  });
  return amount > 0 && amount < 0.0001 ? `<${formatter.format(0.0001)}` : formatter.format(amount);
}
