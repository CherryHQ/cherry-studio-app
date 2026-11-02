export function formatAiUsageCost(amount: number, currency: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  });
  return amount > 0 && amount < 0.0001 ? `<${formatter.format(0.0001)}` : formatter.format(amount);
}
